<?php

declare(strict_types=1);

namespace App\Services\Order;

use App\Enums\InventoryTransactionType;
use App\Enums\OrderStatus;
use App\Enums\ReturnStatus;
use App\Exceptions\BusinessRuleException;
use App\Models\Customer;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\OrderReturn;
use App\Models\OrderReturnItem;
use App\Models\User;
use App\Notifications\ReturnRequestedMail;
use App\Services\Accounting\JournalLine;
use App\Services\Accounting\JournalService;
use App\Services\Inventory\InventoryService;
use App\Services\Support\DocumentNumberService;
use App\Services\Support\SettingsService;
use App\Support\Money;
use App\Support\Quantity;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Notification;
use Throwable;

/**
 * Sending goods from a delivered order back.
 *
 *   request   the customer names the items and why; nothing moves
 *   approve   the shop agrees to take them back (or rejects)
 *   receive   the goods are here: each line back on the shelf or written
 *             off as damaged, and the sale is reversed in the books
 *   refund    the money goes back, through the ordinary refund
 *
 * The books at "receive":
 *
 *      Dr Sales Returns (contra-revenue)   Cr Refunds Payable   the value
 *      Dr Inventory                        Cr Cost of Goods Sold  restocked
 *                                                                 lines, at
 *                                                                 the cost
 *                                                                 they left at
 *
 * and the refund then clears Refunds Payable against the till (PaymentService).
 * A damaged line stays in cost of goods sold: the shop paid for it and got
 * nothing back, which is exactly what that account is for.
 */
class ReturnService
{
    public function __construct(
        private readonly DocumentNumberService $numbers,
        private readonly InventoryService $inventory,
        private readonly JournalService $journal,
        private readonly PaymentService $payments,
        private readonly SettingsService $settings,
    ) {}

    /** The last day a return can be asked for, or null if none can. */
    public function returnableUntil(Order $order): ?Carbon
    {
        if ($order->status !== OrderStatus::Delivered || $order->delivered_at === null) {
            return null;
        }

        return $order->delivered_at->copy()->addDays($this->settings->int('return_window_days', 7))->endOfDay();
    }

    public function canRequest(Order $order): bool
    {
        $until = $this->returnableUntil($order);

        return $until !== null && now()->lte($until);
    }

    /**
     * How much of each line can still be asked back: bought, less what has
     * come back already, less what another open return is claiming.
     *
     * @return array<int, Quantity> order_item_id => quantity
     */
    public function returnable(Order $order): array
    {
        $order->loadMissing('items');

        $claimed = OrderReturnItem::query()
            ->whereHas('orderReturn', fn ($q) => $q->where('order_id', $order->id)
                ->whereIn('status', [ReturnStatus::Requested->value, ReturnStatus::Approved->value]))
            ->selectRaw('order_item_id, SUM(quantity) as qty')
            ->groupBy('order_item_id')
            ->pluck('qty', 'order_item_id');

        $left = [];

        foreach ($order->items as $item) {
            $qty = $item->quantity()
                ->minus(Quantity::of($item->quantity_returned))
                ->minus(Quantity::of((string) ($claimed[$item->id] ?? '0')));

            $left[$item->id] = $qty->isPositive() ? $qty : Quantity::zero();
        }

        return $left;
    }

    /**
     * @param  array<int, array{order_item_id: int, quantity: string|int|float}>  $lines
     */
    public function request(Order $order, array $lines, string $reason, ?string $note, ?Customer $customer): OrderReturn
    {
        if (! array_key_exists($reason, OrderReturn::REASONS)) {
            throw new BusinessRuleException('Choose a reason for the return.', 'return_reason_invalid');
        }

        $return = DB::transaction(function () use ($order, $lines, $reason, $note, $customer): OrderReturn {
            $order = Order::whereKey($order->id)->lockForUpdate()->with('items')->firstOrFail();

            if (! $this->canRequest($order)) {
                throw new BusinessRuleException(
                    $order->status === OrderStatus::Delivered
                        ? 'The return window for this order has closed.'
                        : 'Only a delivered order can be returned.',
                    'return_not_allowed',
                );
            }

            $left = $this->returnable($order);
            $wanted = [];

            foreach ($lines as $line) {
                $qty = Quantity::of((string) $line['quantity']);

                if (! $qty->isPositive()) {
                    continue;
                }

                $itemId = (int) $line['order_item_id'];

                if (! isset($left[$itemId])) {
                    throw new BusinessRuleException('That item is not on this order.', 'return_item_unknown');
                }

                if ($qty->greaterThan($left[$itemId])) {
                    throw new BusinessRuleException(
                        "Only {$left[$itemId]->format()} of that item can still be returned.",
                        'return_quantity_exceeds',
                    );
                }

                $wanted[$itemId] = $qty;
            }

            if ($wanted === []) {
                throw new BusinessRuleException('Choose at least one item to return.', 'return_empty');
            }

            $return = new OrderReturn;
            $return->forceFill([
                'number' => $this->numbers->next('order_return'),
                'order_id' => $order->id,
                'customer_id' => $customer?->id ?? $order->customer_id,
                'status' => ReturnStatus::Requested,
                'reason' => $reason,
                'customer_note' => $note,
                'requested_at' => now(),
            ])->save();

            foreach ($wanted as $itemId => $qty) {
                $row = new OrderReturnItem;
                $row->forceFill([
                    'order_return_id' => $return->id,
                    'order_item_id' => $itemId,
                    'quantity' => $qty->value(),
                ])->save();
            }

            return $return;
        });

        $this->tellTheShop($return->load('order', 'items.orderItem'));

        return $return;
    }

    public function approve(OrderReturn $return, User $by, ?string $note = null): OrderReturn
    {
        return $this->move($return, ReturnStatus::Requested, ReturnStatus::Approved, $by, $note, ['approved_at' => now()]);
    }

    public function reject(OrderReturn $return, User $by, ?string $note = null): OrderReturn
    {
        return $this->move($return, ReturnStatus::Requested, ReturnStatus::Rejected, $by, $note, ['rejected_at' => now()]);
    }

    /**
     * The goods are back. Each line either goes back on the shelf at the cost
     * it left at, or is written off; either way the sale is reversed.
     *
     * @param  array<int, bool>  $restock  order_return_item_id => back on the shelf?
     */
    public function receive(OrderReturn $return, array $restock, User $by, ?string $note = null): OrderReturn
    {
        return DB::transaction(function () use ($return, $restock, $by, $note): OrderReturn {
            $return = OrderReturn::whereKey($return->id)->lockForUpdate()->firstOrFail();

            if ($return->status !== ReturnStatus::Approved) {
                throw new BusinessRuleException('Approve the return before receiving the goods.', 'return_not_approved');
            }

            $return->load(['order', 'items.orderItem.variation']);
            $order = $return->order;
            $value = Money::zero();

            foreach ($return->items as $row) {
                /** @var OrderItem $item */
                $item = OrderItem::whereKey($row->order_item_id)->lockForUpdate()->firstOrFail();
                $qty = $row->quantity();

                $back = (bool) ($restock[$row->id] ?? true);

                // Back on the shelf at the cost frozen on the line when it
                // shipped -- never today's average, which would invent a
                // profit or loss out of a price change.
                if ($back && $item->unit_cost !== null && $row->orderItem->variation !== null) {
                    $this->inventory->receive(
                        variation: $row->orderItem->variation,
                        quantity: $qty,
                        totalCost: Money::of((string) $item->unit_cost)->times($qty->value()),
                        type: InventoryTransactionType::SaleReturn,
                        reference: $return,
                        counterAccount: 'cogs',
                        note: "Return {$return->number} on order {$order->number}",
                    );
                }

                $item->forceFill([
                    'quantity_returned' => Quantity::of($item->quantity_returned)->plus($qty)->value(),
                ])->save();

                $row->forceFill(['restock' => $back])->save();

                $value = $value->plus($this->lineValue($item, $qty));
            }

            $refund = $this->lessOrderDiscount($order, $value);

            if ($refund->isPositive()) {
                $this->journal->postOnce(
                    reference: $return,
                    event: 'order.returned',
                    lines: [
                        JournalLine::debit('sales_returns', $refund, memo: "Return {$return->number}"),
                        JournalLine::credit('refund_payable', $refund, $order->customer, "Return {$return->number}"),
                    ],
                    memo: "Return {$return->number} on order {$order->number}",
                );
            }

            $return->forceFill([
                'status' => ReturnStatus::Received,
                'received_at' => now(),
                'refund_amount' => $refund->value(),
                'handled_by' => $by->id,
                'staff_note' => $note ?? $return->staff_note,
            ])->save();

            return $return->refresh();
        });
    }

    /**
     * Give the money back. Defaults to the value worked out on receipt; the
     * shop may give more (the delivery charge, say) up to what was paid.
     */
    public function refund(OrderReturn $return, User $by, Money|string|null $amount = null): OrderReturn
    {
        if ($return->status !== ReturnStatus::Received) {
            throw new BusinessRuleException('Receive the goods before refunding.', 'return_not_received');
        }

        $amount = $amount === null ? Money::of($return->refund_amount) : Money::of($amount);

        $payment = $this->payments->refund(
            order: $return->order,
            amount: $amount,
            reason: "Refund for return {$return->number}",
            by: $by,
        );

        $return->forceFill([
            'status' => ReturnStatus::Refunded,
            'refunded_at' => now(),
            'refund_payment_id' => $payment->id,
            'handled_by' => $by->id,
        ])->save();

        return $return->refresh();
    }

    /** What the returned units were sold for, after their line discount. */
    private function lineValue(OrderItem $item, Quantity $qty): Money
    {
        $bought = Quantity::of($item->quantity);

        if (! $bought->isPositive()) {
            return Money::zero();
        }

        return Money::of($item->line_total)->times($qty->value())->dividedBy($bought->value());
    }

    /**
     * Take off the returned goods' share of any order-wide discount (coupon,
     * reward points), so a refund can never hand back more than was paid for
     * them.
     */
    private function lessOrderDiscount(Order $order, Money $value): Money
    {
        $subtotal = Money::of($order->subtotal);
        $discount = Money::of((string) ($order->coupon_discount ?? '0'))
            ->plus(Money::of((string) ($order->reward_points_discount ?? '0')));

        if (! $subtotal->isPositive() || ! $discount->isPositive()) {
            return $value;
        }

        $share = $discount->times($value->value())->dividedBy($subtotal->value());
        $net = $value->minus($share);

        return $net->isNegative() ? Money::zero() : $net;
    }

    /**
     * @param  array<string, mixed>  $stamps
     */
    private function move(OrderReturn $return, ReturnStatus $from, ReturnStatus $to, User $by, ?string $note, array $stamps): OrderReturn
    {
        return DB::transaction(function () use ($return, $from, $to, $by, $note, $stamps): OrderReturn {
            $return = OrderReturn::whereKey($return->id)->lockForUpdate()->firstOrFail();

            if ($return->status !== $from) {
                throw new BusinessRuleException(
                    "This return is {$return->status->label()}, so it cannot be marked {$to->label()}.",
                    'return_invalid_transition',
                );
            }

            $return->forceFill($stamps + [
                'status' => $to,
                'handled_by' => $by->id,
                'staff_note' => $note ?? $return->staff_note,
            ])->save();

            return $return->refresh();
        });
    }

    /** An email to the shop: someone wants to send something back. */
    private function tellTheShop(OrderReturn $return): void
    {
        $to = trim((string) ($this->settings->get('notify_admin_email') ?: $this->settings->get('store_email')));

        if ($to === '' || ! $this->settings->bool('notify_admin_new_order', true)) {
            return;
        }

        try {
            Notification::route('mail', $to)->notify(new ReturnRequestedMail($return));
        } catch (Throwable $e) {
            Log::warning('Return request email not sent.', ['return' => $return->number, 'error' => $e->getMessage()]);
        }
    }
}
