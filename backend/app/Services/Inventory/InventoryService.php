<?php

declare(strict_types=1);

namespace App\Services\Inventory;

use App\Exceptions\BusinessRuleException;
use App\Models\Inventory;
use App\Models\InventoryTransaction;
use App\Models\ProductVariation;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use RuntimeException;

class InventoryService
{
    /**
     * Receive stock into inventory.
     *
     * Used for:
     * - opening stock
     * - purchase
     * - customer return
     * - stock transfer in
     */
    public function receive(
        ProductVariation $variation,
        float|string $quantity,
        float|string $unitCost,
        string $type = 'purchase',
        ?string $referenceType = null,
        int|string|null $referenceId = null,
        ?string $note = null,
    ): InventoryTransaction {
        $quantity = $this->positiveQuantity($quantity);
        $unitCost = $this->nonNegativeMoney($unitCost);

        if (! in_array($type, [
            'opening',
            'purchase',
            'sale_return',
            'transfer_in',
            'adjustment',
        ], true)) {
            throw new BusinessRuleException(
                "Invalid incoming inventory transaction type [{$type}].",
                'invalid_inventory_type',
            );
        }

        return DB::transaction(function () use (
            $variation,
            $quantity,
            $unitCost,
            $type,
            $referenceType,
            $referenceId,
            $note,
        ): InventoryTransaction {
            $inventory = $this->lockInventory($variation);

            $oldQuantity = (string) $inventory->quantity;
            $oldValue = (string) $inventory->stock_value;

            $incomingValue = bcmul(
                (string) $quantity,
                (string) $unitCost,
                6
            );

            $newQuantity = bcadd(
                $oldQuantity,
                (string) $quantity,
                3
            );

            $newValue = bcadd(
                $oldValue,
                $incomingValue,
                6
            );

            $newAverageCost = $this->calculateAverageCost(
                $newQuantity,
                $newValue
            );

            $inventory->update([
                'quantity' => $newQuantity,
                'average_cost' => $newAverageCost,
                'stock_value' => $newValue,
            ]);

            return InventoryTransaction::create([
                'inventory_id' => $inventory->id,
                'product_variation_id' => $variation->id,
                'type' => $type,
                'quantity' => $quantity,
                'unit_cost' => $unitCost,
                'total_cost' => $incomingValue,
                'balance_quantity' => $newQuantity,
                'balance_value' => $newValue,
                'reference_type' => $referenceType,
                'reference_id' => $referenceId,
                'note' => $note,
                'created_by' => Auth::id(),
            ]);
        });
    }

    /**
     * Issue stock from inventory.
     *
     * The cost used for the outgoing movement is the current
     * weighted average cost.
     */
    public function issue(
        ProductVariation $variation,
        float|string $quantity,
        string $type = 'sale',
        ?string $referenceType = null,
        int|string|null $referenceId = null,
        ?string $note = null,
    ): InventoryTransaction {
        $quantity = $this->positiveQuantity($quantity);

        if (! in_array($type, [
            'sale',
            'purchase_return',
            'damage',
            'transfer_out',
            'adjustment',
        ], true)) {
            throw new BusinessRuleException(
                "Invalid outgoing inventory transaction type [{$type}].",
                'invalid_inventory_type',
            );
        }

        return DB::transaction(function () use (
            $variation,
            $quantity,
            $type,
            $referenceType,
            $referenceId,
            $note,
        ): InventoryTransaction {
            $inventory = $this->lockInventory($variation);

            $available = bcsub(
                (string) $inventory->quantity,
                (string) $inventory->reserved_quantity,
                3
            );

            if (
                bccomp(
                    $available,
                    (string) $quantity,
                    3
                ) === -1
            ) {
                throw new BusinessRuleException(
                    "Insufficient stock for variation [{$variation->sku}]. ".
                    "Available: {$available}, requested: {$quantity}.",
                    'insufficient_stock',
                );
            }

            $oldQuantity = (string) $inventory->quantity;
            $oldValue = (string) $inventory->stock_value;
            $averageCost = (string) $inventory->average_cost;

            $outgoingValue = bcmul(
                (string) $quantity,
                $averageCost,
                6
            );

            $newQuantity = bcsub(
                $oldQuantity,
                (string) $quantity,
                3
            );

            $newValue = bcsub(
                $oldValue,
                $outgoingValue,
                6
            );

            if (bccomp($newQuantity, '0', 3) === 0) {
                $newValue = '0.000000';
                $newAverageCost = '0.000000';
            } else {
                $newAverageCost = $averageCost;
            }

            $inventory->update([
                'quantity' => $newQuantity,
                'average_cost' => $newAverageCost,
                'stock_value' => $newValue,
            ]);

            return InventoryTransaction::create([
                'inventory_id' => $inventory->id,
                'product_variation_id' => $variation->id,
                'type' => $type,
                'quantity' => bcmul(
                    (string) $quantity,
                    '-1',
                    3
                ),
                'unit_cost' => $averageCost,
                'total_cost' => bcmul(
                    (string) $outgoingValue,
                    '-1',
                    6
                ),
                'balance_quantity' => $newQuantity,
                'balance_value' => $newValue,
                'reference_type' => $referenceType,
                'reference_id' => $referenceId,
                'note' => $note,
                'created_by' => Auth::id(),
            ]);
        });
    }

    /**
     * Create an opening stock movement.
     */
    public function openingStock(
        ProductVariation $variation,
        float|string $quantity,
        float|string $unitCost,
        ?string $note = null,
    ): InventoryTransaction {
        return $this->receive(
            variation: $variation,
            quantity: $quantity,
            unitCost: $unitCost,
            type: 'opening',
            note: $note,
        );
    }

    /**
     * Adjust inventory to an exact physical quantity.
     *
     * If physical quantity is higher, stock is received.
     * If physical quantity is lower, stock is issued.
     */
    public function adjust(
        ProductVariation $variation,
        float|string $physicalQuantity,
        ?string $note = null,
    ): ?InventoryTransaction {
        $physicalQuantity = $this->nonNegativeQuantity(
            $physicalQuantity
        );

        return DB::transaction(function () use (
            $variation,
            $physicalQuantity,
            $note,
        ): ?InventoryTransaction {
            $inventory = $this->lockInventory($variation);

            $current = (string) $inventory->quantity;

            $comparison = bccomp(
                (string) $physicalQuantity,
                $current,
                3
            );

            if ($comparison === 0) {
                return null;
            }

            if ($comparison === 1) {
                $difference = bcsub(
                    (string) $physicalQuantity,
                    $current,
                    3
                );

                return $this->receive(
                    variation: $variation,
                    quantity: $difference,
                    unitCost: (string) $inventory->average_cost,
                    type: 'adjustment',
                    note: $note,
                );
            }

            $difference = bcsub(
                $current,
                (string) $physicalQuantity,
                3
            );

            return $this->issue(
                variation: $variation,
                quantity: $difference,
                type: 'adjustment',
                note: $note,
            );
        });
    }

    /**
     * Reserve stock for an order.
     *
     * Reservation does not create an inventory transaction because
     * physical stock has not moved yet.
     */
    public function reserve(
        ProductVariation $variation,
        float|string $quantity
    ): Inventory {
        $quantity = $this->positiveQuantity($quantity);

        return DB::transaction(function () use (
            $variation,
            $quantity,
        ): Inventory {
            $inventory = $this->lockInventory($variation);

            $available = bcsub(
                (string) $inventory->quantity,
                (string) $inventory->reserved_quantity,
                3
            );

            if (
                bccomp(
                    $available,
                    (string) $quantity,
                    3
                ) === -1
            ) {
                throw new BusinessRuleException(
                    "Insufficient available stock for reservation. ".
                    "Available: {$available}, requested: {$quantity}.",
                    'insufficient_stock',
                );
            }

            $inventory->update([
                'reserved_quantity' => bcadd(
                    (string) $inventory->reserved_quantity,
                    (string) $quantity,
                    3
                ),
            ]);

            return $inventory->fresh();
        });
    }

    /**
     * Release previously reserved stock.
     */
    public function releaseReservation(
        ProductVariation $variation,
        float|string $quantity
    ): Inventory {
        $quantity = $this->positiveQuantity($quantity);

        return DB::transaction(function () use (
            $variation,
            $quantity,
        ): Inventory {
            $inventory = $this->lockInventory($variation);

            if (
                bccomp(
                    (string) $inventory->reserved_quantity,
                    (string) $quantity,
                    3
                ) === -1
            ) {
                throw new BusinessRuleException(
                    'Cannot release more reserved stock than currently reserved.',
                    'invalid_reservation_release',
                );
            }

            $inventory->update([
                'reserved_quantity' => bcsub(
                    (string) $inventory->reserved_quantity,
                    (string) $quantity,
                    3
                ),
            ]);

            return $inventory->fresh();
        });
    }

    /**
     * Confirm a sale after stock was reserved.
     *
     * Reservation is removed and physical stock is deducted.
     */
    public function commitReservation(
        ProductVariation $variation,
        float|string $quantity,
        string $referenceType = 'order',
        int|string|null $referenceId = null,
        ?string $note = null,
    ): InventoryTransaction {
        $quantity = $this->positiveQuantity($quantity);

        return DB::transaction(function () use (
            $variation,
            $quantity,
            $referenceType,
            $referenceId,
            $note,
        ): InventoryTransaction {
            $inventory = $this->lockInventory($variation);

            if (
                bccomp(
                    (string) $inventory->reserved_quantity,
                    (string) $quantity,
                    3
                ) === -1
            ) {
                throw new BusinessRuleException(
                    'Cannot commit more stock than has been reserved.',
                    'invalid_reservation_commit',
                );
            }

            $inventory->update([
                'reserved_quantity' => bcsub(
                    (string) $inventory->reserved_quantity,
                    (string) $quantity,
                    3
                ),
            ]);

            return $this->issue(
                variation: $variation,
                quantity: $quantity,
                type: 'sale',
                referenceType: $referenceType,
                referenceId: $referenceId,
                note: $note,
            );
        });
    }

    /**
     * Get or create the inventory row.
     */
    public function inventoryFor(
        ProductVariation $variation
    ): Inventory {
        return Inventory::firstOrCreate(
            [
                'product_variation_id' => $variation->id,
            ],
            [
                'quantity' => 0,
                'reserved_quantity' => 0,
                'average_cost' => 0,
                'stock_value' => 0,
            ]
        );
    }

    /**
     * Lock inventory row for update.
     *
     * Creating the row happens before the lock.
     */
    private function lockInventory(
        ProductVariation $variation
    ): Inventory {
        $this->ensureStockTracked($variation);

        $inventory = $this->inventoryFor($variation);

        return Inventory::query()
            ->whereKey($inventory->id)
            ->lockForUpdate()
            ->firstOrFail();
    }

    private function ensureStockTracked(
        ProductVariation $variation
    ): void {
        $variation->loadMissing('product');

        if (! $variation->product->is_stock_tracked) {
            throw new BusinessRuleException(
                "Product [{$variation->product->name}] does not track stock.",
                'stock_not_tracked',
            );
        }
    }

    private function calculateAverageCost(
        string $quantity,
        string $value
    ): string {
        if (bccomp($quantity, '0', 3) === 0) {
            return '0.000000';
        }

        return bcdiv(
            $value,
            $quantity,
            6
        );
    }

    private function positiveQuantity(
        float|string $quantity
    ): string {
        $quantity = (string) $quantity;

        if (
            ! is_numeric($quantity) ||
            bccomp($quantity, '0', 3) !== 1
        ) {
            throw new BusinessRuleException(
                'Quantity must be greater than zero.',
                'invalid_quantity',
            );
        }

        return number_format(
            (float) $quantity,
            3,
            '.',
            ''
        );
    }

    private function nonNegativeQuantity(
        float|string $quantity
    ): string {
        $quantity = (string) $quantity;

        if (
            ! is_numeric($quantity) ||
            bccomp($quantity, '0', 3) === -1
        ) {
            throw new BusinessRuleException(
                'Quantity cannot be negative.',
                'invalid_quantity',
            );
        }

        return number_format(
            (float) $quantity,
            3,
            '.',
            ''
        );
    }

    private function nonNegativeMoney(
        float|string $amount
    ): string {
        $amount = (string) $amount;

        if (
            ! is_numeric($amount) ||
            bccomp($amount, '0', 6) === -1
        ) {
            throw new BusinessRuleException(
                'Amount cannot be negative.',
                'invalid_amount',
            );
        }

        return number_format(
            (float) $amount,
            6,
            '.',
            ''
        );
    }
}