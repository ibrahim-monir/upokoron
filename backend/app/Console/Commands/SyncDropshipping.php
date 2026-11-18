<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Services\Catalog\Dropshipping\DropshippingSyncRunner;
use Illuminate\Console\Command;
use Throwable;

class SyncDropshipping extends Command
{
    protected $signature = 'dropshipping:sync {--force : Start now even if automatic sync is off or not due}';

    protected $description = 'Start a DropShipping.com.bd import + price/stock sync when one is due.';

    public function handle(DropshippingSyncRunner $runner): int
    {
        if (! $this->option('force') && ! $runner->due()) {
            return self::SUCCESS;
        }

        try {
            $run = $runner->start($this->option('force') ? 'manual' : 'schedule');
        } catch (Throwable $e) {
            $this->warn($e->getMessage());

            return $this->option('force') ? self::FAILURE : self::SUCCESS;
        }

        $this->info("Sync run #{$run->id} queued.");

        return self::SUCCESS;
    }
}
