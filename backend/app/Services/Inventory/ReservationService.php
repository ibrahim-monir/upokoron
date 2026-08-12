<?php

declare(strict_types=1);

namespace App\Services\Inventory;

use App\Exceptions\BusinessRuleException;
use App\Models\Inventory;
use App\Models\ProductVariation;
use App\Models\StockReservation;
use App\Services\Support\SettingsService;
use App\Support\Quantity;
use Illuminate\Support\Facades\DB;

/**
 * Holds stock between "added to cart" and "shipped".
 *
 * The reservation rows are the truth; `inventories.reserved_quantity` is a
 * cache of their sum, kept only so `available_quantity` can be a generated
 * column and therefore indexable.
 *
 * Every method takes the same row lock InventoryService uses, so a reservation
 * and a sale cannot both decide there is enough stock for the last unit.
 */
class ReservationService
{
    public function __construct(private readonly SettingsService $settings) {}

    /**
     * Hold stock for a cart or an order.
     *
     * `expiresIn` null means hold indefinitely, which is right for a confirmed
     * COD order. An unpaid online checkout gets the configured TTL, because
     * without one every abandoned cart removes sellable stock forever.
     */
    public function reserve(
        ProductVariation $variation,
        Quantity|string $quantity,
        ?int $orderId = null,
        ?string $cartToken = null,
        ?int $expiresInMinutes = null,
        bool $indefinite = false,
    ): StockReservation {
        $quantity = Quantity::of($quantity);

        if (! $quantity->isPositive()) {
            throw new BusinessRuleException(
                'A reservation must be for more than zero.',
                'invalid_quantity',
            );
        }

        return DB::transaction(function () use ($variation, $quantity, $orderId, $cartToken, $expiresInMinutes, $indefinite): StockReservation {
            $inventory = $this->lock($variation);

            if ($inventory->available()->lessThan($quantity)) {
                throw new BusinessRuleException(
                    sprintf(
                        'Only %s of %s left. Cannot reserve %s.',
                        $inventory->available()->format(),
                        $variation->sku,
                        $quantity->format(),
                    ),
                    'insufficient_stock',
                    [
                        'sku' => $variation->sku,
                        'available' => $inventory->available()->value(),
                        'requested' => $quantity->value(),
                    ],
                );
            }

            $expiresAt = $indefinite
                ? null
                : now()->addMinutes($expiresInMinutes ?? $this->settings->int('reservation_ttl_minutes', 30));

            $reservation = StockReservation::create([
                'product_variation_id' => $variation->id,
                'order_id' => $orderId,
                'cart_token' => $cartToken,
                'quantity' => $quantity->value(),
                'status' => 'active',
                'expires_at' => $expiresAt,
            ]);

            $this->syncCounter($inventory);

            return $reservation;
        });
    }

    /**
     * Give the stock back. Used on cancellation and on expiry.
     */
    public function release(StockReservation $reservation): void
    {
        if (! $reservation->isActive()) {
            return;
        }

        DB::transaction(function () use ($reservation): void {
            $inventory = Inventory::where('product_variation_id', $reservation->product_variation_id)
                ->lockForUpdate()
                ->first();

            $reservation->update(['status' => 'released', 'released_at' => now()]);

            if ($inventory !== null) {
                $this->syncCounter($inventory);
            }
        });
    }

    /**
     * Mark a hold as fulfilled.
     *
     * Called when the stock physically leaves. The reservation stops counting
     * towards reserved_quantity because InventoryService has just removed the
     * units from `quantity` -- counting both would double-deduct.
     */
    public function consume(StockReservation $reservation): void
    {
        if (! $reservation->isActive()) {
            return;
        }

        DB::transaction(function () use ($reservation): void {
            $inventory = Inventory::where('product_variation_id', $reservation->product_variation_id)
                ->lockForUpdate()
                ->first();

            $reservation->update(['status' => 'consumed']);

            if ($inventory !== null) {
                $this->syncCounter($inventory);
            }
        });
    }

    /**
     * @return array<int, StockReservation>
     */
    public function releaseForOrder(int $orderId): array
    {
        $reservations = StockReservation::active()->where('order_id', $orderId)->get();

        foreach ($reservations as $reservation) {
            $this->release($reservation);
        }

        return $reservations->all();
    }

    public function releaseForCart(string $cartToken): void
    {
        foreach (StockReservation::active()->where('cart_token', $cartToken)->get() as $reservation) {
            $this->release($reservation);
        }
    }

    /**
     * Release everything that has timed out. Run from the scheduler.
     */
    public function releaseExpired(): int
    {
        $expired = StockReservation::expired()->get();

        foreach ($expired as $reservation) {
            $this->release($reservation);
        }

        return $expired->count();
    }

    /**
     * Rebuild every counter from the reservation rows.
     *
     * The counter is a cache, and caches drift. This is what invariant I4
     * checks, and what repairs it.
     *
     * @return int number of rows that were wrong
     */
    public function reconcileAll(): int
    {
        $repaired = 0;

        Inventory::query()->orderBy('id')->chunkById(200, function ($inventories) use (&$repaired): void {
            foreach ($inventories as $inventory) {
                $expected = $this->activeTotalFor((int) $inventory->product_variation_id);

                if (! Quantity::of($inventory->reserved_quantity)->equals($expected)) {
                    $inventory->forceFill(['reserved_quantity' => $expected->value()])->save();
                    $repaired++;
                }
            }
        });

        return $repaired;
    }

    private function syncCounter(Inventory $inventory): void
    {
        $inventory->forceFill([
            'reserved_quantity' => $this->activeTotalFor((int) $inventory->product_variation_id)->value(),
        ])->save();
    }

    private function activeTotalFor(int $variationId): Quantity
    {
        $total = StockReservation::active()
            ->where('product_variation_id', $variationId)
            ->sum('quantity');

        return Quantity::of((string) $total);
    }

    private function lock(ProductVariation $variation): Inventory
    {
        $inventory = Inventory::where('product_variation_id', $variation->id)
            ->lockForUpdate()
            ->first();

        if ($inventory !== null) {
            return $inventory;
        }

        // No stock has ever moved for this variation, so there is nothing to
        // reserve. Create the row so the error is "0 available" rather than a
        // null crash.
        app(InventoryService::class)->inventoryFor($variation);

        return Inventory::where('product_variation_id', $variation->id)->lockForUpdate()->firstOrFail();
    }
}
