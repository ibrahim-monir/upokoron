<?php

declare(strict_types=1);

namespace App\Notifications;

use Illuminate\Auth\Notifications\ResetPassword as BaseResetPassword;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;

/**
 * Laravel's built-in ResetPassword notification sends synchronously, so a
 * mail transport hiccup throws inside the HTTP request and the endpoint
 * 500s instead of returning its generic "if that address has an account"
 * response. Queuing it means a bad SMTP connection delays the email --
 * picked up by the cron-driven queue:work in routes/console.php within a
 * minute -- rather than breaking the request that asked for it.
 */
class QueuedResetPassword extends BaseResetPassword implements ShouldQueue
{
    use Queueable;
}
