<?php

declare(strict_types=1);

namespace App\Services\Order;

use App\Enums\PaymentStatus;
use App\Exceptions\BusinessRuleException;
use App\Models\Account;
use App\Models\JournalEntry;
use App\Models\Order;
use App\Models\Payment;
use App\Models\PaymentMethod;
use App\Models\User;
use App\Services\Accounting\JournalLine;
use App\Services\Accounting\JournalService;
use App\Services\Support\DocumentNumberService;
use App\Support\Money;
use Carbon\CarbonInterface;
use Illuminate\Support\Facades\DB;

/**
 * Money against an order.
 *
 * Two things are worth knowing before reading the code.
 *
 * First, `payment_status` on the order is never set by hand. It is derived
 * from the payments actually recorded, every time. A status somebody can type
 * in is a status that eventually disagrees with the money, and then nobody
 * can tell which one is lying.
 *
 * Second, a payment on a COD order does not create revenue -- delivery
 * already did that. Collecting the cash only moves the debt from "the courier
 * owes us" to "we have it":
 *
 *      Dr Cash in Hand     Cr COD Receivable
 *
 * Recording it as income here would count the same sale twice.
 */
class PaymentService
{
    public function __construct(
        private readonly JournalService $journal,
        private readonly DocumentNumberService $numbers,
    ) {}

    /**
     * Record money received against an order.
     *
     * @param  Money|string  $amount  positive; use refund() for money going out
     */
    public function record(
        Order $order,
        Money|string $amount,
        ?PaymentMethod $method = null,
        ?string $reference = null,
        ?string $note = null,
        ?User $by = null,
        CarbonInterface|string|null $receivedAt = null,
        Account|string|null $intoAccount = null,
    ): Payment {
        $amount = Money::of($amount);

        if (! $amount->isPositive()) {
            throw new BusinessRuleException(
                'A payment must be more than zero.',
                'invalid_payment_amount',
            );
        }

        $method ??= $order->paymentMethod;

        return DB::transaction(function () use (
            $order, $amount, $method, $reference, $note, $by, $receivedAt, $intoAccount,
        ): Payment {
            $order = Order::whereKey($order->id)->lockForUpdate()->firstOrFail();

            /*
             * Overpayment is refused rather than absorbed. A courier settling
             * ৳2,000 against a ৳1,200 order is a data-entry mistake or a
             * settlement covering several orders; either way, quietly
             * accepting it leaves the books showing money the shop cannot
             * account for.
             */
            $due = $order->dueAmount();

            if ($amount->greaterThan($due)) {
                throw new BusinessRuleException(
                    sprintf('That is more than the %s still owed on this order.', $due->format()),
                    'payment_exceeds_due',
                    ['due' => $due->value(), 'offered' => $amount->value()],
                );
            }

            $account = $intoAccount ?? $method?->accountKey() ?? 'cash_in_hand';

            $payment = new Payment;

            $payment->forceFill([
                'number' => $this->numbers->next('payment'),
                'order_id' => $order->id,
                'payment_method_id' => $method?->id,
                'amount' => $amount->value(),
                'reference' => $reference,
                'note' => $note,
                'received_at' => $receivedAt ?? now(),
                'received_by' => $by?->id,
            ])->save();

            $entry = $this->postReceipt($order, $payment, $amount, $account);

            $payment->forceFill([
                'account_id' => $entry->lines->firstWhere('debit', '>', 0)?->account_id,
                'journal_entry_id' => $entry->id,
            ])->save();

            $this->syncOrderTotals($order);

            return $payment->refresh();
        });
    }

    /**
     * Give money back.
     *
     * A negative payment rather than a delete, so the history reads as what
     * happened: money came in, then some went out. Deleting the receipt would
     * make it look as though the customer never paid.
     */
    public function refund(
        Order $order,
        Money|string $amount,
        ?string $reason = null,
        ?User $by = null,
        Account|string|null $fromAccount = null,
    ): Payment {
        $amount = Money::of($amount);

        if (! $amount->isPositive()) {
            throw new BusinessRuleException('A refund must be more than zero.', 'invalid_refund_amount');
        }

        return DB::transaction(function () use ($order, $amount, $reason, $by, $fromAccount): Payment {
            $order = Order::whereKey($order->id)->lockForUpdate()->firstOrFail();

            $paid = Money::of($order->paid_total);
            $refunded = Money::of($order->refunded_total);
            $refundable = $paid->minus($refunded);

            if ($amount->greaterThan($refundable)) {
                throw new BusinessRuleException(
                    sprintf('Only %s can be refunded on this order.', $refundable->format()),
                    'refund_exceeds_paid',
                    ['refundable' => $refundable->value(), 'requested' => $amount->value()],
                );
            }

            $account = $fromAccount ?? $order->paymentMethod?->accountKey() ?? 'cash_in_hand';

            $payment = new Payment;

            $payment->forceFill([
                'number' => $this->numbers->next('payment'),
                'order_id' => $order->id,
                'payment_method_id' => $order->payment_method_id,
                'amount' => $amount->negated()->value(),
                'note' => $reason,
                'received_at' => now(),
                'received_by' => $by?->id,
            ])->save();

            $entry = $this->journal->post(
                event: 'order.refunded',
                lines: [
                    // Refunds Payable, not straight to revenue: reversing the
                    // sale would erase it from the sales report, and a sale
                    // that happened and was then refunded is two facts, not
                    // zero facts.
                    JournalLine::debit('refund_payable', $amount, $order->customer, "Refund on {$order->number}"),
                    JournalLine::credit($account, $amount, memo: "Refund on {$order->number}"),
                ],
                reference: $payment,
                memo: "Refund on order {$order->number}",
            );

            $payment->forceFill(['journal_entry_id' => $entry->id])->save();

            $this->syncOrderTotals($order);

            return $payment->refresh();
        });
    }

    /**
     * Post the receipt.
     *
     * What it clears depends on how the order was paid for. On COD the
     * delivery already debited COD Receivable, so the cash simply clears that
     * balance. On anything else the customer paid before delivery, and there
     * is no revenue yet -- so it sits as a customer advance until the sale is
     * recognised.
     */
    private function postReceipt(
        Order $order,
        Payment $payment,
        Money $amount,
        Account|string $account,
    ): JournalEntry {
        $isCod = $order->paymentMethod?->type->isCollectedOnDelivery() ?? false;
        $delivered = $order->delivered_at !== null;

        $clears = match (true) {
            $isCod && $delivered => 'cod_receivable',
            $delivered => 'accounts_receivable',

            // Paid up front, nothing delivered: the shop owes goods, not the
            // other way round. That is a liability, not income.
            default => 'customer_advance',
        };

        return $this->journal->post(
            event: 'order.payment',
            lines: [
                JournalLine::debit($account, $amount, memo: "Payment for {$order->number}"),
                JournalLine::credit($clears, $amount, $order->customer, "Payment for {$order->number}"),
            ],
            reference: $payment,
            memo: "Payment {$payment->number} for order {$order->number}",
        );
    }

    /**
     * Recompute what has been paid, from the payments themselves.
     *
     * Both totals are caches over the payments table, rebuilt on every change
     * rather than incremented -- an increment that runs twice is silently
     * wrong forever, while a recount is self-correcting.
     */
    public function syncOrderTotals(Order $order): Order
    {
        $receipts = Money::of((string) ($order->payments()->receipts()->sum('amount') ?: '0'));
        $refunds = Money::of((string) ($order->payments()->refunds()->sum('amount') ?: '0'))->abs();

        $net = $receipts->minus($refunds);
        $total = Money::of($order->total);

        $status = match (true) {
            $refunds->isPositive() && $net->isZero() => PaymentStatus::Refunded,
            $net->isZero() => PaymentStatus::Unpaid,
            $net->greaterThanOrEqual($total) => PaymentStatus::Paid,
            default => PaymentStatus::Partial,
        };

        $order->forceFill([
            'paid_total' => $net->value(),
            'refunded_total' => $refunds->value(),
            'payment_status' => $status,
        ])->save();

        return $order;
    }
}
