<?php

declare(strict_types=1);

namespace App\Jobs;

use App\Models\DropShippingImportRun;
use App\Services\Catalog\Dropshipping\DropshippingSyncRunner;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Throwable;

/** One slice of one DropShipping.com.bd listing page. */
class SyncDropshippingPage implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries = 3;

    public int $timeout = 170;

    public array $backoff = [30, 120];

    public function __construct(
        public readonly int $runId,
        public readonly int $sourceIndex,
        public readonly int $page,
        public readonly int $offset = 0,
    ) {}

    public function handle(DropshippingSyncRunner $runner): void
    {
        $runner->step($this->runId, $this->sourceIndex, $this->page, $this->offset);
    }

    public function failed(?Throwable $exception): void
    {
        DropShippingImportRun::query()
            ->whereKey($this->runId)
            ->whereIn('status', ['queued', 'running'])
            ->update([
                'status' => 'failed',
                'error' => mb_substr('Page '.$this->page.': '.($exception?->getMessage() ?? 'The sync job failed.'), 0, 4000),
                'finished_at' => now(),
                'updated_at' => now(),
            ]);
    }
}
