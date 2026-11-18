<?php

declare(strict_types=1);

namespace App\Services\Catalog\Dropshipping;

use App\Enums\ProductStatus;
use App\Jobs\SyncDropshippingPage;
use App\Models\DropShippingCatalogItem;
use App\Models\DropShippingImportRun;
use App\Models\Product;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use RuntimeException;
use Throwable;

/**
 * Starts sync runs and walks them through every source and page.
 *
 * A run is a chain of queued jobs, one slice of one page each, so it fits
 * inside the one-minute queue worker the cPanel cron starts. Creating a
 * product costs an extra panel request and up to five image downloads, so a
 * slice stops after a handful of new products and the next job resumes at
 * the same page.
 */
class DropshippingSyncRunner
{
    /** New products per job. */
    public const NEW_PER_JOB = 12;

    /** A run that has not moved for this long is treated as dead. */
    private const STALE_MINUTES = 90;

    public function __construct(
        private readonly DropshippingSettings $settings,
        private readonly DropshippingClient $client,
        private readonly DropshippingSync $sync,
    ) {}

    public function active(): ?DropShippingImportRun
    {
        $run = DropShippingImportRun::query()
            ->where('provider', DropshippingSync::PROVIDER)
            ->whereIn('status', ['queued', 'running'])
            ->latest('id')
            ->first();

        if ($run !== null && $run->updated_at !== null && $run->updated_at->lt(now()->subMinutes(self::STALE_MINUTES))) {
            $run->update([
                'status' => 'failed',
                'error' => trim(($run->error ? $run->error."\n" : '').'Stopped: no progress for '.self::STALE_MINUTES.' minutes. Is the cron job running?'),
                'finished_at' => now(),
            ]);

            return null;
        }

        return $run;
    }

    public function latest(): ?DropShippingImportRun
    {
        return DropShippingImportRun::query()
            ->where('provider', DropshippingSync::PROVIDER)
            ->latest('id')
            ->first();
    }

    /** Whether automatic sync should start a run now. */
    public function due(): bool
    {
        if (! $this->settings->get('auto_sync') || ! $this->settings->configured() || $this->active() !== null) {
            return false;
        }

        $last = $this->latest();
        $hours = max(1, (int) $this->settings->get('interval_hours'));

        return $last === null || ($last->finished_at ?? $last->created_at)->lt(now()->subHours($hours));
    }

    public function start(string $trigger = 'manual', ?int $userId = null): DropShippingImportRun
    {
        if (! $this->settings->configured()) {
            throw new RuntimeException('Add the panel phone number and password first.');
        }

        $sources = $this->settings->sources();
        if ($sources === []) {
            throw new RuntimeException('Add at least one panel category to Sources.');
        }

        $lock = Cache::lock('dropshipping-bd-start', 15);
        if (! $lock->get()) {
            throw new RuntimeException('A sync is being started. Try again in a moment.');
        }

        try {
            if ($this->active() !== null) {
                throw new RuntimeException('A sync is already running.');
            }

            return DB::transaction(function () use ($sources, $trigger, $userId): DropShippingImportRun {
                $run = DropShippingImportRun::create([
                    'provider' => DropshippingSync::PROVIDER,
                    'status' => 'queued',
                    'trigger' => $trigger,
                    'source_index' => 0,
                    'source_count' => count($sources),
                    'page_from' => 1,
                    'current_page' => 1,
                    'started_by' => $userId,
                ]);

                SyncDropshippingPage::dispatch($run->id, 0, 1, 0)->onQueue('imports')->afterCommit();

                return $run;
            });
        } finally {
            $lock->release();
        }
    }

    public function cancel(): ?DropShippingImportRun
    {
        $run = $this->active();
        $run?->update(['status' => 'cancelled', 'finished_at' => now()]);

        return $run;
    }

    /** One job's worth of work. */
    public function step(int $runId, int $sourceIndex, int $page, int $offset): void
    {
        $run = DropShippingImportRun::find($runId);
        if ($run === null || ! $run->isActive()) {
            return;
        }

        $sources = $this->settings->sources();
        $source = $sources[$sourceIndex] ?? null;
        if ($source === null) {
            $this->finish($run);

            return;
        }

        $run->update([
            'status' => 'running',
            'source_index' => $sourceIndex,
            'source_count' => count($sources),
            'current_page' => $page,
            'started_at' => $run->started_at ?? now(),
        ]);

        $listing = $this->client->listPage($source['params'], $page);
        $names = [
            'categories' => $listing['categories'],
            'sub_categories' => $listing['sub_categories'],
            'sub_sub_categories' => $listing['sub_sub_categories'],
        ];

        $counts = ['created' => 0, 'updated' => 0, 'unchanged' => 0, 'skipped' => 0, 'failed' => 0];
        $errors = [];
        $next = null;
        $items = $listing['items'];

        for ($i = $offset; $i < count($items); $i++) {
            if ($counts['created'] >= self::NEW_PER_JOB) {
                $next = [$sourceIndex, $page, $i];
                break;
            }

            try {
                $counts[$this->sync->process($items[$i], $source, $names, $run->id)]++;
            } catch (Throwable $e) {
                $counts['failed']++;
                if (count($errors) < 5) {
                    $errors[] = 'Code '.($items[$i]['product_code'] ?? '?').': '.mb_substr($e->getMessage(), 0, 300);
                }
            }
        }

        if ($next === null) {
            $next = $page < $listing['last_page']
                ? [$sourceIndex, $page + 1, 0]
                : [$sourceIndex + 1, 1, 0];
        }

        $run->refresh();
        if (! $run->isActive()) {
            return; // Cancelled while this page was working.
        }

        $run->created_count += $counts['created'];
        $run->updated_count += $counts['updated'];
        $run->skipped_count += $counts['skipped'];
        $run->failed_count += $counts['failed'];
        $run->seen_count += ($i - $offset) - $counts['failed'];
        $run->last_page = $listing['last_page'];
        if ($offset === 0 && $page === 1) {
            $run->total_count += $listing['total'];
        }
        if ($errors !== []) {
            $run->error = mb_substr(($run->error ? $run->error."\n" : '').implode("\n", $errors), 0, 4000);
        }
        $run->save();

        if ($next[0] >= count($sources)) {
            $this->finish($run);

            return;
        }

        SyncDropshippingPage::dispatch($run->id, ...$next)->onQueue('imports');
    }

    /**
     * Products in the sources that this full run did not see are gone from
     * the panel (or from the chosen categories): treat them as sold out.
     */
    private function finish(DropShippingImportRun $run): void
    {
        $hidden = 0;

        if ($this->settings->get('hide_out_of_stock') && $run->failed_count === 0) {
            DropShippingCatalogItem::query()
                ->where('provider', DropshippingSync::PROVIDER)
                ->where(fn ($q) => $q->whereNull('last_run_id')->orWhere('last_run_id', '!=', $run->id))
                ->where('in_stock', true)
                ->whereNotNull('product_id')
                ->each(function (DropShippingCatalogItem $item) use (&$hidden): void {
                    $product = Product::find($item->product_id);
                    $item->in_stock = false;
                    if ($product !== null && $this->sync->applyStock($item, $product, false)) {
                        $hidden++;
                    }
                    $item->save();
                });
        }

        $run->update([
            'status' => $run->failed_count > 0 ? 'completed_with_errors' : 'completed',
            'hidden_count' => $hidden,
            'finished_at' => now(),
        ]);
    }

    /** Products the panel has made unavailable, for the status card. */
    public function counts(): array
    {
        $q = fn () => DropShippingCatalogItem::query()->where('provider', DropshippingSync::PROVIDER);

        return [
            'linked' => $q()->whereNotNull('product_id')->count(),
            'out_of_stock' => $q()->where('in_stock', false)->count(),
            'archived_by_sync' => $q()->where('hidden_by_sync', true)->count(),
            'active' => $q()->whereHas('product', fn ($p) => $p->where('status', ProductStatus::Active->value))->count(),
        ];
    }
}
