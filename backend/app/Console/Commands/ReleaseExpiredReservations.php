<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Services\Inventory\ReservationService;
use Illuminate\Console\Command;

/**
 * Frees stock held by checkouts that were never completed.
 *
 * Without this every abandoned cart removes sellable stock permanently, and
 * a shop slowly shows itself as sold out while the warehouse is full.
 */
class ReleaseExpiredReservations extends Command
{
    protected $signature = 'reservations:release-expired {--reconcile : Also rebuild the reserved_quantity counters}';

    protected $description = 'Release stock reservations that have timed out';

    public function handle(ReservationService $reservations): int
    {
        $released = $reservations->releaseExpired();

        $this->info($released === 0
            ? 'No expired reservations.'
            : "Released {$released} expired reservation(s).");

        if ($this->option('reconcile')) {
            $repaired = $reservations->reconcileAll();

            $this->info($repaired === 0
                ? 'Reserved quantities were already correct.'
                : "Repaired {$repaired} reserved_quantity counter(s).");
        }

        return self::SUCCESS;
    }
}
