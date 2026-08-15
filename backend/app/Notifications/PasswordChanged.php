<?php

declare(strict_types=1);

namespace App\Notifications;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * Confirms a password change after the fact -- via the reset link or the
 * in-account "change password" form. Carries no action to take, only a
 * signal: if the recipient didn't do this, their account may be
 * compromised and the login sessions this change just revoked are the
 * first clue something is wrong.
 */
class PasswordChanged extends Notification implements ShouldQueue
{
    use Queueable;

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        return (new MailMessage)
            ->subject('Your password was changed')
            ->line('This is a confirmation that the password on your account was just changed.')
            ->line('You have been signed out on every other device as a result.')
            ->line("If you did not make this change, contact us immediately -- someone else may have access to your account.");
    }
}
