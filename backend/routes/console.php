<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Schedule;

/*
|--------------------------------------------------------------------------
| Scheduled work
|--------------------------------------------------------------------------
|
| cPanel cannot keep a queue worker alive, so the scheduler drains the queue
| itself once a minute rather than relying on a long-running daemon. One cron
| entry drives everything:
|
|   * * * * * php /home/USER/laravel/artisan schedule:run >> /dev/null 2>&1
|
*/

Schedule::command('queue:work --stop-when-empty --max-time=50')
    ->everyMinute()
    ->withoutOverlapping();

// Abandoned checkouts must give their stock back, or the shop shows itself
// as sold out while the shelves are full.
Schedule::command('reservations:release-expired')
    ->everyFiveMinutes()
    ->withoutOverlapping();

// Rebuild the reserved_quantity caches from the reservation rows overnight.
Schedule::command('reservations:release-expired --reconcile')
    ->dailyAt('01:00');

// The invariants no report would otherwise reveal. If this fails, something
// wrote to the ledger or the stock tables without going through a service.
Schedule::command('accounting:check')
    ->dailyAt('02:00')
    ->emailOutputOnFailure(config('mail.from.address'));
