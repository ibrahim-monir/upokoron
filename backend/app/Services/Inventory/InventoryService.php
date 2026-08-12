<?php

declare(strict_types=1);

namespace App\Services\Inventory;

use App\Enums\InventoryDirection;
use App\Enums\InventoryTransactionType;
use App\Exceptions\BusinessRuleException;
use App\Models\Account;
use App\Models\Inventory;
use App\Models\InventoryTransaction;
use App\Models\JournalEntry;
use App\Models\ProductVariation;
use App\Services\Accounting\JournalLine;
use App\Services\Accounting\JournalService;
use App\Support\Money;
use App\Support\Quantity;
use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;

/**
 * The single gateway for every stock movement.
 *
 * Nothing else may write to `inventories` or `inventory_transactions` -- both
 * models have an empty $fillable, and the transaction model refuses updates
 * and deletes outright. Concentrating movements here is what makes the three
 * inventory invariants checkable in one place:
 *
 *   I2  SUM(inventories.stock_value) = balance of account 1150 Inventory
 *   I3  inventories.quantity = signed sum of its inventory_transactions
 *   I4  inventories.reserved_quantity = sum of its active stock_reservations
 *
 * Every method takes a row lock before reading, so two concurrent sales can
 * never both compute COGS from the same pre-sale value.
 */
class InventoryService
{
    public function __construct(
        private readonly CostingService $costing,
        private readonly JournalService $journal,
    ) {}

    /**
     * Stock in, at a known total cost.
     *
     * `counterAccount` is supplied by whatever document caused the movement:
     * a purchase receipt credits Accounts Payable, a sales return credits
     * COGS. Movements with no document (opening stock, found stock) resolve
     * their own counter-account from the transaction type.
     */
    public function receive(
        ProductVariation $variation,
        Quantity|string $quantity,
        Money|string $totalCost,
        InventoryTransactionType $type = InventoryTransactionType::Purchase,
        ?Model $reference = null,
        Account|string|null $counterAccount = null,
        ?string $note = null,
        CarbonInterface|string|null $date = null,
    ): InventoryTransaction {
        $quantity = $this->positive($quantity);
        $totalCost = Money::of($totalCost);

        return DB::transaction(function () use (
            $variation, $quantity, $totalCost, $type, $reference, $counterAccount, $note, $date
        ): InventoryTransaction {
            $inventory = $this->lock($variation);

            $before = ['qty' => $inventory->onHand(), 'value' => $inventory->value()];

            $result = $this->costing->applyInbound(
                $before['qty'],
                $before['value'],
                $quantity,
                $totalCost,
            );

            $this->writeInventory($inventory, $result, [
                'last_purchase_price' => $type === InventoryTransactionType::Purchase
                    ? $this->costing->unitCostFor($quantity, $totalCost)
                    : $inventory->last_purchase_price,
            ]);

            return $this->record(
                $inventory, $variation, $type, InventoryDirection::In,
                $quantity, $totalCost, $before, $result, $reference, $counterAccount, $note, $date,
            );
        });
    }

    /**
     * Stock out, costed at the current weighted average.
     *
     * The returned transaction carries `total_cost`, which is the COGS for
     * this movement. Callers MUST freeze that onto their own document -- an
     * order item stores it and never recalculates, so a later price change
     * cannot alter historical profit.
     */
    public function issue(
        ProductVariation $variation,
        Quantity|string $quantity,
        InventoryTransactionType $type = InventoryTransactionType::Sale,
        ?Model $reference = null,
        Account|string|null $counterAccount = null,
        ?string $note = null,
        CarbonInterface|string|null $date = null,
        bool $allowReserved = false,
    ): InventoryTransaction {
        $quantity = $this->positive($quantity);

        return DB::transaction(function () use (
            $variation, $quantity, $type, $reference, $counterAccount, $note, $date, $allowReserved
        ): InventoryTransaction {
            $inventory = $this->lock($variation);

            $this->assertSufficientStock($inventory, $variation, $quantity, $allowReserved);

            $before = ['qty' => $inventory->onHand(), 'value' => $inventory->value()];

            $result = $this->costing->applyOutbound($before['qty'], $before['value'], $quantity);

            $this->writeInventory($inventory, $result);

            return $this->record(
                $inventory, $variation, $type, InventoryDirection::Out,
                $quantity, $result['cost'], $before, $result, $reference, $counterAccount, $note, $date,
            );
        });
    }

    /**
     * Stock out at a KNOWN unit cost rather than the current average.
     *
     * A purchase return goes back to the supplier at what it was received
     * for, not at whatever the average has drifted to since.
     */
    public function issueAtCost(
        ProductVariation $variation,
        Quantity|string $quantity,
        Money|string $unitCost,
        InventoryTransactionType $type = InventoryTransactionType::PurchaseReturn,
        ?Model $reference = null,
        Account|string|null $counterAccount = null,
        ?string $note = null,
        CarbonInterface|string|null $date = null,
    ): InventoryTransaction {
        $quantity = $this->positive($quantity);
        $unitCost = Money::of($unitCost);

        return DB::transaction(function () use (
            $variation, $quantity, $unitCost, $type, $reference, $counterAccount, $note, $date
        ): InventoryTransaction {
            $inventory = $this->lock($variation);

            $this->assertSufficientStock($inventory, $variation, $quantity, allowReserved: false);

            $before = ['qty' => $inventory->onHand(), 'value' => $inventory->value()];

            $result = $this->costing->applyOutboundAtCost(
                $before['qty'], $before['value'], $quantity, $unitCost
            );

            $this->writeInventory($inventory, $result);

            return $this->record(
                $inventory, $variation, $type, InventoryDirection::Out,
                $quantity, $result['cost'], $before, $result, $reference, $counterAccount, $note, $date,
            );
        });
    }

    /**
     * Opening stock. Debits Inventory, credits Opening Balance Equity.
     */
    public function openingStock(
        ProductVariation $variation,
        Quantity|string $quantity,
        Money|string $totalCost,
        ?string $note = null,
        CarbonInterface|string|null $date = null,
    ): InventoryTransaction {
        return $this->receive(
            $variation,
            $quantity,
            $totalCost,
            InventoryTransactionType::Opening,
            reference: $variation,
            note: $note ?? 'Opening stock',
            date: $date,
        );
    }

    /**
     * Damage, loss, or a correction found during a stock count.
     *
     * The value has to land somewhere in the P&L or it silently disappears;
     * these post against 5200 Inventory Shrinkage.
     */
    public function adjust(
        ProductVariation $variation,
        Quantity|string $quantity,
        InventoryDirection $direction,
        InventoryTransactionType $type = InventoryTransactionType::Adjustment,
        ?Model $reference = null,
        Money|string|null $unitCost = null,
        ?string $note = null,
        CarbonInterface|string|null $date = null,
    ): InventoryTransaction {
        if ($direction === InventoryDirection::Out) {
            return $this->issue(
                $variation, $quantity, $type, $reference,
                note: $note, date: $date, allowReserved: false,
            );
        }

        // Stock appearing from nowhere still needs a cost. Default to the
        // current average, so a recount does not move the average around.
        $quantity = $this->positive($quantity);
        $inventory = $this->inventoryFor($variation);

        $unit = $unitCost !== null
            ? Money::of($unitCost)
            : Money::of($inventory->average_cost);

        return $this->receive(
            $variation,
            $quantity,
            $unit->times($quantity->value()),
            $type,
            $reference,
            note: $note,
            date: $date,
        );
    }

    /**
     * The inventory row for a variation, created on first use.
     *
     * Products created before this module existed have no row yet, and a
     * missing row must not look like zero stock in a report.
     */
    public function inventoryFor(ProductVariation $variation): Inventory
    {
        $inventory = Inventory::firstWhere('product_variation_id', $variation->id);

        if ($inventory !== null) {
            return $inventory;
        }

        try {
            return Inventory::forceCreate([
                'product_variation_id' => $variation->id,
                'quantity' => '0.000',
                'reserved_quantity' => '0.000',
                'stock_value' => '0.00',
                'average_cost' => '0.000000',
                'min_stock' => '0.000',
                'reorder_level' => '0.000',
            ]);
        } catch (UniqueConstraintViolationException) {
            // Lost a race with a concurrent first movement; the winner's row
            // is the right answer for both.
            return Inventory::where('product_variation_id', $variation->id)->firstOrFail();
        }
    }

    /**
     * Fetch under a write lock. Everything that changes quantity or value
     * goes through here first.
     */
    private function lock(ProductVariation $variation): Inventory
    {
        $this->assertStockTracked($variation);

        // Ensure the row exists before trying to lock it.
        $this->inventoryFor($variation);

        return Inventory::where('product_variation_id', $variation->id)
            ->lockForUpdate()
            ->firstOrFail();
    }

    /**
     * Lock several variations at once, in ascending id order.
     *
     * The fixed order is the whole point: two concurrent multi-line orders
     * touching the same products in different sequences would otherwise
     * deadlock each other.
     *
     * @param  array<int, ProductVariation>  $variations
     * @return array<int, Inventory> keyed by product_variation_id
     */
    public function lockMany(array $variations): array
    {
        $ids = collect($variations)->pluck('id')->unique()->sort()->values();

        foreach ($variations as $variation) {
            $this->inventoryFor($variation);
        }

        return Inventory::whereIn('product_variation_id', $ids)
            ->orderBy('product_variation_id')
            ->lockForUpdate()
            ->get()
            ->keyBy('product_variation_id')
            ->all();
    }

    private function assertSufficientStock(
        Inventory $inventory,
        ProductVariation $variation,
        Quantity $quantity,
        bool $allowReserved,
    ): void {
        // Shipping an order consumes stock it already reserved, so it draws
        // against on-hand. Everything else may only take what is unreserved.
        $usable = $allowReserved ? $inventory->onHand() : $inventory->available();

        if ($usable->greaterThanOrEqual($quantity)) {
            return;
        }

        throw new BusinessRuleException(
            sprintf(
                'Not enough stock for %s. Available %s, requested %s.',
                $variation->sku,
                $usable->format(),
                $quantity->format(),
            ),
            'insufficient_stock',
            [
                'sku' => $variation->sku,
                'product_variation_id' => $variation->id,
                'available' => $usable->value(),
                'requested' => $quantity->value(),
            ],
        );
    }

    private function assertStockTracked(ProductVariation $variation): void
    {
        $product = $variation->relationLoaded('product') ? $variation->product : $variation->product()->first();

        if ($product !== null && ! $product->is_stock_tracked) {
            throw new BusinessRuleException(
                "[{$product->name}] is not stock tracked, so its stock cannot be moved.",
                'product_not_stock_tracked',
                ['product_variation_id' => $variation->id],
            );
        }
    }

    /**
     * @param  array{quantity: Quantity, value: Money, average: string}  $result
     * @param  array<string, mixed>  $extra
     */
    private function writeInventory(Inventory $inventory, array $result, array $extra = []): void
    {
        $inventory->forceFill(array_merge([
            'quantity' => $result['quantity']->value(),
            'stock_value' => $result['value']->value(),
            'average_cost' => $result['average'],
            'last_movement_at' => now(),
        ], $extra))->save();
    }

    /**
     * Write the movement, then post its accounting entry against it.
     *
     * The order matters. An earlier version made the journal entry reference
     * the VARIATION, but journal idempotency is keyed on
     * (reference_type, reference_id, event) -- so a second purchase of the
     * same product collided with the first and was rejected as a duplicate,
     * even though buying the same thing twice is entirely normal.
     *
     * The movement itself is the correct source document: exactly one journal
     * entry per stock movement, and the unique index on
     * (reference, variation, type) already stops the same document moving the
     * same stock twice, one layer earlier and with a clearer message.
     *
     * @param  array{qty: Quantity, value: Money}  $before
     * @param  array{quantity: Quantity, value: Money, average: string}  $result
     */
    private function record(
        Inventory $inventory,
        ProductVariation $variation,
        InventoryTransactionType $type,
        InventoryDirection $direction,
        Quantity $quantity,
        Money $totalCost,
        array $before,
        array $result,
        ?Model $reference,
        Account|string|null $counterAccount,
        ?string $note,
        CarbonInterface|string|null $date,
    ): InventoryTransaction {
        $movement = $this->writeTransaction(
            $inventory, $variation, $type, $direction,
            $quantity, $totalCost, $before, $result, $reference, $note, $date,
        );

        $entry = $this->postJournal($type, $direction, $totalCost, $movement, $counterAccount, $variation, $date);

        if ($entry !== null) {
            // The model blocks updates, so the link is written through the
            // query builder. It touches no quantity and no value.
            DB::table('inventory_transactions')
                ->where('id', $movement->id)
                ->update(['journal_entry_id' => $entry->id]);

            $movement->setAttribute('journal_entry_id', $entry->id);
            $movement->syncOriginal();
        }

        return $movement;
    }

    /**
     * @param  array{qty: Quantity, value: Money}  $before
     * @param  array{quantity: Quantity, value: Money, average: string}  $result
     */
    private function writeTransaction(
        Inventory $inventory,
        ProductVariation $variation,
        InventoryTransactionType $type,
        InventoryDirection $direction,
        Quantity $quantity,
        Money $totalCost,
        array $before,
        array $result,
        ?Model $reference,
        ?string $note,
        CarbonInterface|string|null $date,
    ): InventoryTransaction {
        try {
            return InventoryTransaction::forceCreate([
                'inventory_id' => $inventory->id,
                'product_variation_id' => $variation->id,
                'type' => $type,
                'direction' => $direction,
                'quantity' => $quantity->value(),
                'unit_cost' => $this->costing->unitCostFor($quantity, $totalCost),
                'total_cost' => $totalCost->value(),
                'quantity_before' => $before['qty']->value(),
                'quantity_after' => $result['quantity']->value(),
                'value_before' => $before['value']->value(),
                'value_after' => $result['value']->value(),
                'average_cost_after' => $result['average'],
                'reference_type' => $reference?->getMorphClass(),
                'reference_id' => $reference?->getKey(),
                // Read from the raw attribute bag: not every referencing
                // document has a `number` column, and $reference->number would
                // throw under the strict models this project runs in dev.
                'reference_number' => $reference?->getAttributes()['number'] ?? null,
                // Linked immediately after, once the entry exists.
                'journal_entry_id' => null,
                'note' => $note,
                'created_by' => Auth::id(),
                'transacted_at' => $this->normaliseDate($date),
                'created_at' => now(),
            ]);
        } catch (UniqueConstraintViolationException) {
            // The unique index on (reference, variation, type) refused a
            // second identical movement. Reaching it means a retry got past
            // the caller's own state check.
            throw new BusinessRuleException(
                sprintf(
                    'Stock has already been moved for this document (%s, %s). Refusing to move it twice.',
                    $type->label(),
                    $variation->sku,
                ),
                'duplicate_stock_movement',
                ['product_variation_id' => $variation->id, 'type' => $type->value],
            );
        }
    }

    /**
     * Post the accounting side of a movement.
     *
     * Inventory is always one leg; the other comes from the caller's document
     * or from the transaction type. Movements whose counter-account is settled
     * elsewhere (a purchase receipt posts its own payable) pass null and get
     * no entry here, so the value is never posted twice.
     */
    private function postJournal(
        InventoryTransactionType $type,
        InventoryDirection $direction,
        Money $value,
        InventoryTransaction $movement,
        Account|string|null $counterAccount,
        ProductVariation $variation,
        CarbonInterface|string|null $date,
    ): ?JournalEntry {
        $counter = $counterAccount ?? $type->counterAccountKey();

        if ($counter === null || $value->isZero()) {
            return null;
        }

        $lines = $direction === InventoryDirection::In
            ? [JournalLine::debit('inventory', $value), JournalLine::credit($counter, $value)]
            : [JournalLine::debit($counter, $value), JournalLine::credit('inventory', $value)];

        return $this->journal->post(
            'inventory.'.$type->value,
            $lines,
            $this->normaliseDate($date),
            $movement,
            $type->label().' - '.$variation->sku,
        );
    }

    private function positive(Quantity|string $quantity): Quantity
    {
        $quantity = Quantity::of($quantity);

        if (! $quantity->isPositive()) {
            throw new BusinessRuleException(
                'A stock movement must have a quantity greater than zero.',
                'invalid_quantity',
                ['quantity' => $quantity->value()],
            );
        }

        return $quantity;
    }

    private function normaliseDate(CarbonInterface|string|null $date): string
    {
        if ($date === null) {
            return Carbon::now(config('upokoron.display_timezone'))->toDateTimeString();
        }

        return $date instanceof CarbonInterface
            ? $date->toDateTimeString()
            : Carbon::parse($date)->toDateTimeString();
    }
}
