<?php

declare(strict_types=1);

namespace App\Jobs;

use App\Models\Order;
use App\Notifications\OrderMail;
use App\Services\Support\SettingsService;
use App\Services\Support\SmsService;
use App\Support\Money;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Notification;
use Throwable;

/**
 * Everyone who should hear about an order event, told once.
 *
 * Queued, and dispatched after the order's transaction commits, so a slow
 * mail server or an SMS gateway out of credit delays a message instead of
 * failing a checkout -- and a rolled-back order never sends one.
 *
 * Each channel is tried on its own: an email failure does not stop the SMS.
 *
 * Events: 'placed', then the status an order moved to (confirmed, shipped,
 * out_for_delivery, delivered, cancelled). Anything else is ignored.
 */
class SendOrderNotifications implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable;

    public int $tries = 2;

    public const EVENTS = ['placed', 'confirmed', 'shipped', 'out_for_delivery', 'delivered', 'cancelled'];

    public function __construct(
        public readonly int $orderId,
        public readonly string $event,
    ) {
        $this->afterCommit();
    }

    public function handle(SettingsService $settings, SmsService $sms): void
    {
        if (! in_array($this->event, self::EVENTS, true)) {
            return;
        }

        $order = Order::with(['items', 'customer', 'paymentMethod'])->find($this->orderId);

        if ($order === null) {
            return;
        }

        $storeName = (string) ($settings->get('store_name') ?: config('app.name'));

        // ------------------------------------------------ the shop, by email
        if ($this->event === 'placed' && $settings->bool('notify_admin_new_order', true)) {
            $to = trim((string) ($settings->get('notify_admin_email') ?: $settings->get('store_email')));

            if ($to !== '') {
                $this->attempt('admin email', fn () => Notification::route('mail', $to)
                    ->notifyNow(new OrderMail($order, 'admin', $this->event, $storeName)));
            }
        }

        // ------------------------------------------- the customer, by email
        $email = $order->customer?->email;

        if ($email && $settings->bool('notify_customer_email', true)) {
            $this->attempt('customer email', fn () => Notification::route('mail', $email)
                ->notifyNow(new OrderMail($order, 'customer', $this->event, $storeName)));
        }

        // --------------------------------------------- the customer, by SMS
        if ($order->ship_phone && $settings->bool("sms_on_{$this->event}", false) && $sms->isConfigured()) {
            $this->attempt('customer SMS', function () use ($sms, $order, $storeName, $settings): void {
                $result = $sms->send($order->ship_phone, $this->smsText($order, $storeName, (string) $settings->get('store_phone', '')));

                if (! $result['sent']) {
                    Log::warning('Order SMS not sent.', ['order' => $order->number, 'reason' => $result['message']]);
                }
            });
        }
    }

    /**
     * Short, and in plain English letters: a Bangla SMS is billed as Unicode,
     * at roughly two and a half times the price per message.
     */
    private function smsText(Order $order, string $storeName, string $storePhone): string
    {
        $total = 'Tk '.Money::of($order->total)->value();
        $due = $order->dueAmount();
        $help = $storePhone !== '' ? " Help: {$storePhone}" : '';

        return match ($this->event) {
            'placed' => "{$storeName}: Order {$order->number} received, total {$total}. We will call you to confirm.",
            'confirmed' => "{$storeName}: Your order {$order->number} is confirmed and being prepared.",
            'shipped' => "{$storeName}: Order {$order->number} is with the courier."
                .($due->isPositive() ? ' Please keep Tk '.$due->value().' ready.' : ''),
            'out_for_delivery' => "{$storeName}: Order {$order->number} is out for delivery today.",
            'delivered' => "{$storeName}: Order {$order->number} delivered. Thank you for shopping with us!",
            'cancelled' => "{$storeName}: Order {$order->number} has been cancelled.{$help}",
            default => "{$storeName}: Update on order {$order->number}.",
        };
    }

    private function attempt(string $what, callable $send): void
    {
        try {
            $send();
        } catch (Throwable $e) {
            Log::warning("Order notification failed: {$what}.", [
                'order_id' => $this->orderId,
                'event' => $this->event,
                'error' => $e->getMessage(),
            ]);
        }
    }
}
