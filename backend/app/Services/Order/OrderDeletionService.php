<?php

declare(strict_types=1);

namespace App\Services\Order;

use App\Exceptions\BusinessRuleException;
use App\Models\Coupon;
use App\Models\Order;
use App\Models\StockReservation;
use App\Models\User;
use App\Services\Inventory\ReservationService;
use App\Services\Rewards\RewardPointsService;
use Illuminate\Support\Facades\DB;

/**
 * Removing test orders: to the trash first, and from there for good.
 *
 * Only an order that never touched the books may go. Until it ships, an
 * order has posted nothing to the ledger and moved no stock; all it holds is
 * a reservation, a coupon use and possibly some redeemed points, and each of
 * those can be handed back exactly. Once goods leave, or money is recorded
 * against it, the order is part of the accounts and has to be cancelled or
 * returned instead -- deleting it would leave journal entries and stock
 * movements pointing at nothing.
 *
 *   trash       stock hold released, so a binned order cannot block a sale;
 *               coupon use and redeemed points stay with it
 *   restore     stock held again, or refused if it has since been sold
 *   delete      from the trash only; coupon use and points handed back
 *
 * The audit log keeps a snapshot at each step, so a removal is still on the
 * record after the row is gone.
 */
class OrderDeletionService
{
    public function __construct(
        private readonly ReservationService $reservations,
        private readonly RewardPointsService $rewards,
    ) {}

    /** Why this order cannot be deleted, or null if it can. */
    public function blocker(Order $order): ?string
    {
        if ($order->status->hasShipped()) {
            return 'This order has shipped, so it is in the stock and accounting records. Mark it returned instead of deleting it.';
        }

        if ($order->payments()->exists()) {
            return 'Money has been recorded against this order, so it cannot be deleted.';
        }

        return null;
    }

    public function trash(Order $order): void
    {
        DB::transaction(function () use ($order): void {
            // Locked so a status change or payment racing this cannot slip in
            // between the check and the delete.
            $order = Order::whereKey($order->id)->lockForUpdate()->firstOrFail();

            $this->guard($order);

            $this->reservations->releaseForOrder($order->id);

            $order->delete();
        });
    }

    public function restore(Order $order): void
    {
        DB::transaction(function () use ($order): void {
            $order = Order::onlyTrashed()->whereKey($order->id)->lockForUpdate()->firstOrFail();

            /*
             * Take the stock back before the order reappears. If some of it
             * sold while the order sat in the trash, reserve() refuses and the
             * whole restore rolls back -- better than an open order promising
             * goods that are no longer on the shelf.
             */
            if ($order->status->holdsStock()) {
                foreach ($order->items()->with('variation')->get() as $item) {
                    if ($item->variation === null) {
                        throw new BusinessRuleException(
                            "\"{$item->product_name}\" no longer exists, so this order cannot be restored.",
                            'variation_missing',
                        );
                    }

                    $this->reservations->reserve(
                        variation: $item->variation,
                        quantity: $item->quantity(),
                        orderId: $order->id,
                        indefinite: true,
                    );
                }
            }

            $order->restore();
        });
    }

    public function forceDelete(Order $order, User $by): void
    {
        DB::transaction(function () use ($order, $by): void {
            $order = Order::onlyTrashed()->whereKey($order->id)->lockForUpdate()->firstOrFail();

            $this->guard($order);

            StockReservation::where('order_id', $order->id)->delete();

            // The coupon use this order counted never happened.
            if ($order->coupon_id !== null) {
                Coupon::withTrashed()->whereKey($order->coupon_id)
                    ->where('used_count', '>', 0)
                    ->decrement('used_count');
            }

            // Points spent on it go back to the customer, as a visible credit
            // rather than by editing the redemption row.
            if ($order->reward_points_used > 0 && $order->customer !== null) {
                $this->rewards->adjustManually(
                    customer: $order->customer,
                    delta: (int) $order->reward_points_used,
                    reason: "Refunded: order {$order->number} was deleted",
                    by: $by,
                );
            }

            // Items and status history go with it (cascadeOnDelete).
            $order->forceDelete();
        });
    }

    private function guard(Order $order): void
    {
        if (($reason = $this->blocker($order)) !== null) {
            throw new BusinessRuleException($reason, 'order_not_deletable');
        }
    }
}
