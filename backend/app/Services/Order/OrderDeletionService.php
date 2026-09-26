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
 * Removing an order as if it had never been placed -- for test orders.
 *
 * Only an order that never touched the books may go. Until it ships, an
 * order has posted nothing to the ledger and moved no stock; all it holds is
 * a reservation, a coupon use and possibly some redeemed points, and each of
 * those can be handed back exactly. Once goods leave, or money is recorded
 * against it, the order is part of the accounts and has to be cancelled or
 * returned instead -- deleting it would leave journal entries and stock
 * movements pointing at nothing.
 *
 * The audit log keeps a snapshot of the deleted row, so the removal itself
 * is still on the record.
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

    public function delete(Order $order, User $by): void
    {
        DB::transaction(function () use ($order, $by): void {
            // Locked so a status change or payment racing this cannot slip in
            // between the check and the delete.
            $order = Order::whereKey($order->id)->lockForUpdate()->firstOrFail();

            if (($reason = $this->blocker($order)) !== null) {
                throw new BusinessRuleException($reason, 'order_not_deletable');
            }

            // Stock it was holding becomes sellable again.
            $this->reservations->releaseForOrder($order->id);
            StockReservation::where('order_id', $order->id)->delete();

            // The coupon use this order counted never happened.
            if ($order->coupon_id !== null) {
                Coupon::whereKey($order->coupon_id)
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
            $order->delete();
        });
    }
}
