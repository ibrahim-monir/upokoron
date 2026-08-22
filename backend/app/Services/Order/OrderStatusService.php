<?php

declare(strict_types=1);

namespace App\Services\Order;

use App\Enums\InventoryTransactionType;
use App\Enums\OrderStatus;
use App\Exceptions\BusinessRuleException;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\OrderStatusHistory;
use App\Models\User;
use App\Services\Accounting\JournalLine;
use App\Services\Accounting\JournalService;
use App\Services\Inventory\InventoryService;
use App\Services\Inventory\ReservationService;
use App\Services\Rewards\RewardPointsService;
use App\Support\Money;
use Illuminate\Support\Facades\DB;

/**
 * Moving an order forward, and the accounting each step owes.
 *
 * The whole design turns on one decision: **revenue and cost of goods are
 * recognised together, at delivery, and not before.**
 *
 * The reason is cash on delivery. When a parcel is handed to a courier the
 * shop has earned nothing -- the goods have merely moved, and a real share of
 * them come straight back undelivered. So shipping moves stock out of
 * Inventory into Goods in Transit *at cost*, which is a movement between two
 * asset accounts and touches neither sales nor profit.
 *
 *      placed      nothing posted; stock is held
 *      shipped     Dr Goods in Transit   Cr Inventory        (at cost)
 *      delivered   Dr COD Receivable     Cr Sales Revenue    (the sale)
 *                                        Cr Shipping Income
 *                  Dr Sales Discounts    (contra-revenue, shown gross)
 *                  Dr Cost of Goods Sold Cr Goods in Transit (the cost)
 *      returned    Dr Inventory          Cr Goods in Transit (reversal)
 *      paid        Dr Cash               Cr COD Receivable
 *
 * Goods in Transit is an ACCOUNT, not a warehouse. That is what makes a
 * failed delivery a single reversing line instead of a stock transfer between
 * locations -- and it is why this system has no locations at all.
 */
class OrderStatusService
{
    public function __construct(
        private readonly InventoryService $inventory,
        private readonly ReservationService $reservations,
        private readonly JournalService $journal,
        private readonly RewardPointsService $rewards,
    ) {}

    /**
     * Move an order to a new status, doing whatever that step requires.
     */
    public function transition(
        Order $order,
        OrderStatus $to,
        ?User $by = null,
        ?string $note = null,
    ): Order {
        $from = $order->status;

        if ($from === $to) {
            return $order;
        }

        if (! $from->canMoveTo($to)) {
            throw new BusinessRuleException(
                "An order that is {$from->label()} cannot be marked {$to->label()}.",
                'invalid_status_transition',
                ['from' => $from->value, 'to' => $to->value, 'allowed' => array_map(
                    static fn (OrderStatus $s): string => $s->value,
                    $from->allowedNext(),
                )],
            );
        }

        return DB::transaction(function () use ($order, $from, $to, $by, $note): Order {
            /*
             * Lock the row first. Two staff marking the same parcel delivered
             * at the same moment would otherwise both pass the check above
             * and post the sale twice.
             */
            $order = Order::whereKey($order->id)->lockForUpdate()->firstOrFail();

            if ($order->status !== $from) {
                throw new BusinessRuleException(
                    'Someone else just changed this order. Reload and try again.',
                    'stale_order_status',
                );
            }

            match ($to) {
                OrderStatus::Shipped => $this->ship($order),
                OrderStatus::Delivered => $this->deliver($order),
                OrderStatus::Cancelled => $this->cancel($order, $note),
                OrderStatus::Returned => $this->returnToOrigin($order),
                default => null,
            };

            $order->forceFill([
                'status' => $to,
                ...$this->timestampFor($to),
            ])->save();

            $history = new OrderStatusHistory;

            $history->forceFill([
                'order_id' => $order->id,
                'from_status' => $from,
                'to_status' => $to,
                'note' => $note,
                'user_id' => $by?->id,
                'created_at' => now(),
            ])->save();

            return $order->refresh();
        });
    }

    /**
     * The goods leave the building.
     *
     * Stock comes out of Inventory at weighted average cost and lands in
     * Goods in Transit. Nothing is a sale yet.
     *
     * The cost each line leaves at is written onto the line here, and that is
     * the figure every profit report uses afterwards -- never the variation's
     * cost as it stands today.
     */
    private function ship(Order $order): void
    {
        $order->loadMissing('items.variation');
        $costTotal = Money::zero();

        foreach ($order->items as $item) {
            if ($item->variation === null) {
                throw new BusinessRuleException(
                    "The product on line {$item->id} no longer exists.",
                    'variation_missing',
                );
            }

            /*
             * allowReserved, because this order is holding the very stock it
             * is about to consume. Without it the check "is there enough
             * available?" fails against a reservation made for this order.
             */
            $movement = $this->inventory->issue(
                variation: $item->variation,
                quantity: $item->quantity(),
                type: InventoryTransactionType::TransitOut,
                reference: $order,
                counterAccount: 'goods_in_transit',
                note: "Order {$order->number} shipped",
                allowReserved: true,
            );

            $lineCost = Money::of($movement->total_cost);

            $item->forceFill([
                'unit_cost' => $movement->unit_cost,
                'total_cost' => $lineCost->value(),
                'inventory_transaction_id' => $movement->id,
            ])->save();

            $costTotal = $costTotal->plus($lineCost);
        }

        /*
         * The holds have done their job.
         *
         * Released AFTER the stock is issued, not before: releasing first
         * would open a gap in which another order could take the very units
         * this one is about to ship. Both operations lock the inventory row
         * inside this transaction, so nothing can interleave.
         */
        $this->reservations->releaseForOrder($order->id);

        $order->forceFill(['cost_total' => $costTotal->value()])->save();
    }

    /**
     * The customer has it. This is the sale.
     *
     * Revenue and cost are posted in the same entry, so a profit figure can
     * never be assembled from one without the other.
     */
    private function deliver(Order $order): void
    {
        $order->loadMissing(['items', 'paymentMethod']);

        $lines = [];

        /*
         * Where the money is owed from. On COD that is the courier, who has
         * the cash and has not handed it over yet -- a different receivable
         * from a customer who owes us directly, and worth seeing separately
         * when a courier is slow to settle.
         */
        $receivable = $order->paymentMethod?->type->isCollectedOnDelivery()
            ? 'cod_receivable'
            : 'accounts_receivable';

        $total = Money::of($order->total);
        $subtotal = Money::of($order->subtotal);
        $discount = Money::of($order->discount_total);
        $shipping = Money::of($order->shipping_charge);
        $extra = Money::of($order->extra_charge);

        // Debit what is owed, in full.
        $lines[] = JournalLine::debit($receivable, $total, $order->customer, "Order {$order->number}");

        /*
         * Revenue is shown GROSS, with the discount as its own contra-revenue
         * line. Netting the discount away hides how much was given away:
         * "sales ৳100,000" reads very differently from "sales ৳125,000,
         * discounts ৳25,000", and only the second lets anyone ask whether the
         * discounting is working.
         */
        if ($discount->isPositive()) {
            $lines[] = JournalLine::credit('sales_revenue', $subtotal->plus($discount), memo: 'Gross sales');
            $lines[] = JournalLine::debit('sales_discounts', $discount, memo: 'Discount given');
        } else {
            $lines[] = JournalLine::credit('sales_revenue', $subtotal, memo: 'Sales');
        }

        // Delivery is income in its own right, not part of the product sale.
        if ($shipping->isPositive()) {
            $lines[] = JournalLine::credit('shipping_income', $shipping, memo: 'Delivery charge');
        }

        if ($extra->isPositive()) {
            $lines[] = JournalLine::credit('misc_income', $extra, memo: 'Payment surcharge');
        }

        /*
         * Cost of the goods, from the figures frozen when they shipped.
         *
         * Never recalculated. This is the whole reason unit_cost lives on the
         * order line: the weighted average moves every time a purchase lands,
         * and a report that recomputed cost would keep rewriting the profit
         * on sales that happened months ago.
         */
        $cost = Money::of($order->cost_total);

        if ($cost->isPositive()) {
            $lines[] = JournalLine::debit('cogs', $cost, memo: "Cost of order {$order->number}");
            $lines[] = JournalLine::credit('goods_in_transit', $cost, memo: 'Goods delivered');
        }

        $this->journal->postOnce(
            reference: $order,
            event: 'order.delivered',
            lines: $lines,
            memo: "Order {$order->number} delivered",
        );

        $this->rewards->awardPurchase($order);
    }

    /**
     * Called off before it shipped.
     *
     * Nothing was posted, so nothing is reversed. The stock simply goes back
     * to being sellable.
     */
    private function cancel(Order $order, ?string $reason): void
    {
        if ($order->status->hasShipped()) {
            throw new BusinessRuleException(
                'Goods that have already left cannot be cancelled. Mark the order returned instead.',
                'cannot_cancel_shipped',
            );
        }

        $this->reservations->releaseForOrder($order->id);

        $order->forceFill(['cancel_reason' => $reason])->save();
    }

    /**
     * Came back undelivered.
     *
     * The goods return to stock at exactly the cost they left with -- taken
     * from the order lines, not from today's average. Bringing them back at a
     * different cost would invent a profit or a loss out of a delivery that
     * never happened.
     */
    private function returnToOrigin(Order $order): void
    {
        $order->loadMissing('items.variation');

        foreach ($order->items as $item) {
            if ($item->variation === null || $item->unit_cost === null) {
                continue;
            }

            $this->inventory->receive(
                variation: $item->variation,
                quantity: $item->quantity(),
                totalCost: Money::of($item->total_cost ?? '0'),
                type: InventoryTransactionType::TransitIn,
                reference: $order,
                counterAccount: 'goods_in_transit',
                note: "Order {$order->number} returned undelivered",
            );
        }
    }

    /**
     * @return array<string, mixed>
     */
    private function timestampFor(OrderStatus $status): array
    {
        return match ($status) {
            OrderStatus::Confirmed => ['confirmed_at' => now()],
            OrderStatus::Shipped => ['shipped_at' => now()],
            OrderStatus::Delivered => ['delivered_at' => now()],
            OrderStatus::Cancelled => ['cancelled_at' => now()],
            OrderStatus::Returned => ['returned_at' => now()],
            default => [],
        };
    }

    /**
     * Gross profit on a delivered order, from the frozen figures.
     */
    public function grossProfit(Order $order): Money
    {
        return $order->items->reduce(
            static fn (Money $carry, OrderItem $item): Money => $carry->plus($item->grossProfit()),
            Money::zero(),
        );
    }
}
