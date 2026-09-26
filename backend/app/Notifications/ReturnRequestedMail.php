<?php

declare(strict_types=1);

namespace App\Notifications;

use App\Models\OrderReturn;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * Tells the shop a customer wants to send something back. Queued, so a mail
 * hiccup never fails the customer's request.
 */
class ReturnRequestedMail extends Notification implements ShouldQueue
{
    use Queueable;

    public function __construct(private readonly OrderReturn $return) {}

    /**
     * @return array<int, string>
     */
    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        $return = $this->return->loadMissing(['order', 'items.orderItem']);

        $mail = (new MailMessage)
            ->subject("Return requested: {$return->number} on order {$return->order->number}")
            ->greeting('A customer wants to return something.')
            ->line("Customer: {$return->order->ship_name}, {$return->order->ship_phone}")
            ->line('Reason: '.(OrderReturn::REASONS[$return->reason] ?? $return->reason))
            ->line($return->customer_note ? "Their note: {$return->customer_note}" : 'No note given.');

        foreach ($return->items as $row) {
            $mail->line("• {$row->orderItem->product_name} × {$row->quantity()->format()}");
        }

        return $mail->action('Open returns', rtrim((string) config('app.url'), '/').'/admin/returns');
    }
}
