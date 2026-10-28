<?php

declare(strict_types=1);

namespace App\Jobs;

use App\Models\DropShippingImportRun;
use App\Services\Catalog\Import\DropShippingCatalog;
use App\Services\Catalog\Import\DropShippingCatalogImporter;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Throwable;

class ImportDropShippingCatalogPage implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries = 3;

    public int $timeout = 180;

    public array $backoff = [30, 120];

    public function __construct(
        public readonly int $runId,
        public readonly int $page,
    ) {}

    public function handle(DropShippingCatalog $catalog, DropShippingCatalogImporter $importer): void
    {
        $run = DropShippingImportRun::find($this->runId);
        if ($run === null || in_array($run->status, ['completed', 'completed_with_errors', 'failed'], true)) {
            return;
        }

        $run->update([
            'status' => 'running',
            'current_page' => $this->page,
            'started_at' => $run->started_at ?? now(),
        ]);

        $batch = $catalog->page($this->page);
        $lastSelectedPage = $run->page_to === null
            ? $batch['last_page']
            : min($run->page_to, $batch['last_page']);

        if ($this->page > $batch['last_page']) {
            $run->update([
                'status' => 'failed',
                'error' => "Page {$this->page} does not exist. The supplier catalog currently has {$batch['last_page']} page(s).",
                'finished_at' => now(),
            ]);

            return;
        }

        $products = $batch['products'];
        if ($run->category_id !== null) {
            $products = array_values(array_filter(
                $products,
                fn (array $product): bool => (string) ($product['category_id'] ?? '') === $run->category_id,
            ));
        }

        $summary = $importer->importProducts($products);

        $run->created_count += $summary['created'];
        $run->skipped_count += $summary['skipped'];
        $run->failed_count += $summary['failed'];
        $run->last_page = $lastSelectedPage;
        if ($summary['errors'] !== []) {
            $currentErrors = $run->error ? $run->error."\n" : '';
            $run->error = mb_substr($currentErrors.implode("\n", $summary['errors']), 0, 4000);
        }

        if ($this->page >= $lastSelectedPage) {
            $run->status = $run->failed_count > 0 ? 'completed_with_errors' : 'completed';
            $run->finished_at = now();
            $run->save();

            return;
        }

        $run->save();
        self::dispatch($this->runId, $this->page + 1)->onQueue('imports')->afterCommit();
    }

    public function failed(?Throwable $exception): void
    {
        DropShippingImportRun::query()
            ->whereKey($this->runId)
            ->whereNotIn('status', ['completed', 'completed_with_errors'])
            ->update([
                'status' => 'failed',
                'error' => mb_substr($exception?->getMessage() ?? 'The catalog import job failed.', 0, 4000),
                'finished_at' => now(),
                'updated_at' => now(),
            ]);
    }
}
