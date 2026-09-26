<?php

declare(strict_types=1);

namespace App\Notifications;

use App\Models\Order;
use App\Models\OrderItem;
use App\Support\Money;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * An order email: to the shop when an order comes in, or to the customer
 * when their order moves.
 *
 * Sent from SendOrderNotifications, which is already a queued job, so this
 * one is not queued again.
 */
class OrderMail extends Notification
{
    public function __construct(
        private readonly Order $order,
        private readonly string $audience,
        private readonly string $event,
        private readonly string $storeName,
    ) {}

    /**
     * @return array<int, string>
     */
    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        $order = $this->order;
        $mail = new MailMessage;

        if ($this->audience === 'admin') {
            $mail->subject("New order {$order->number} — ".Money::of($order->total)->format())
                ->greeting('A new order has come in.')
                ->line("Order: {$order->number}")
                ->line("Customer: {$order->ship_name}, {$order->ship_phone}")
                ->line('Address: '.collect([
                    $order->ship_address_line1, $order->ship_area, $order->ship_city, $order->ship_district,
                ])->filter()->implode(', '))
                ->line('Payment: '.($order->paymentMethod?->name ?? '—'));

            if ($order->customer_note) {
                $mail->line("Note from the customer: {$order->customer_note}");
            }
        } else {
            [$subject, $line] = self::customerCopy($this->event, $order->number);

            $mail->subject("{$this->storeName}: {$subject}")
                ->greeting("Hello {$order->ship_name},")
                ->line($line);
        }

        $mail->line('Items:');

        foreach ($order->items as $item) {
            /** @var OrderItem $item */
            $name = $item->product_name.($item->variation_name ? " ({$item->variation_name})" : '');
            $mail->line("• {$name} × ".rtrim(rtrim((string) $item->quantity, '0'), '.').' — '.Money::of($item->line_total)->format());
        }

        $mail->line('Delivery: '.Money::of($order->shipping_charge)->format())
            ->line('**Total: '.Money::of($order->total)->format().'**');

        if ($this->audience === 'admin') {
            $mail->action('Open the order', rtrim((string) config('app.url'), '/')."/admin/orders/{$order->id}");
        } else {
            $mail->action('Track your order', rtrim((string) config('app.url'), '/').'/track')
                ->salutation("Thank you,\n{$this->storeName}");
        }

        return $mail;
    }

    /**
     * @return array{0: string, 1: string}
     */
    public static function customerCopy(string $event, string $number): array
    {
        return match ($event) {
            'placed' => ["Order {$number} received", "We have received your order {$number}. We will call you shortly to confirm it."],
            'confirmed' => ["Order {$number} confirmed", "Your order {$number} is confirmed and is being prepared."],
            'shipped' => ["Order {$number} is on its way", "Your order {$number} has been handed to the courier."],
            'out_for_delivery' => ["Order {$number} is out for delivery", "Your order {$number} is out for delivery and should reach you today."],
            'delivered' => ["Order {$number} delivered", "Your order {$number} has been delivered. Thank you for shopping with us."],
            'cancelled' => ["Order {$number} cancelled", "Your order {$number} has been cancelled. If this is unexpected, please contact us."],
            default => ["Order {$number} updated", "There is an update on your order {$number}."],
        };
    }
}
