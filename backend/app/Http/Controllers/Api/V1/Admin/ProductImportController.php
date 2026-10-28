<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Jobs\ImportDropShippingCatalogPage;
use App\Models\DropShippingImportRun;
use App\Services\Catalog\Import\ProductCsvImporter;
use App\Services\Catalog\Import\ProductPageScraper;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Getting products in from somewhere else.
 *
 * Two ways: read one product page, or read a supplier's price list. Both
 * require products.create, and neither publishes anything on its own -- a
 * scrape returns a draft for the form, and a CSV lands as drafts unless the
 * file or the importer is told otherwise. Nothing an outside server says
 * should be able to put a price in front of a customer without a person
 * having looked at it.
 */
class ProductImportController extends Controller
{
    public function __construct(
        private readonly ProductPageScraper $scraper,
        private readonly ProductCsvImporter $csv,
    ) {}

    /**
     * Read one product page into a draft. Saves nothing.
     */
    public function scrape(Request $request): JsonResponse
    {
        abort_unless($request->user()?->can('products.create'), 403);

        $data = $request->validate([
            'url' => ['required', 'url', 'max:2000'],
        ]);

        $product = $this->scraper->scrape($data['url']);

        // Worth a log line: this is the shop's server fetching an address a
        // person typed, and if it is ever abused this is the record of it.
        Log::info('Product page imported.', [
            'user_id' => $request->user()?->id,
            'url' => $product->source_url,
        ]);

        return response()->json([
            'message' => "Read [{$product->name}] from {$product->source}. Check every field before saving.",
            'product' => $product->toArray(),
        ]);
    }

    /** Start a background import of every page in the supplier catalog. */
    public function startDropshipping(Request $request): JsonResponse
    {
        abort_unless($request->user()?->can('products.create'), 403);

        $filters = $request->validate([
            'page_from' => ['sometimes', 'integer', 'min:1'],
            'page_to' => ['nullable', 'integer', 'min:1'],
            'category_id' => ['nullable', 'string', 'max:100'],
        ]);
        if (isset($filters['page_to']) && $filters['page_to'] < ($filters['page_from'] ?? 1)) {
            return response()->json(['message' => 'The last page must be greater than or equal to the first page.'], 422);
        }

        if (! filled(config('services.dropshipping.api_key')) || ! filled(config('services.dropshipping.secret_key'))) {
            return response()->json([
                'message' => 'Add the supplier API credentials to the live server .env before starting an import.',
            ], 503);
        }

        $lock = Cache::lock('dropshipping-catalog-import-start', 15);
        if (! $lock->get()) {
            return response()->json(['message' => 'Another supplier import is being started. Try again shortly.'], 409);
        }

        try {
            $run = DB::transaction(function () use ($request, $filters): DropShippingImportRun|JsonResponse {
                $active = DropShippingImportRun::query()
                    ->whereIn('status', ['queued', 'running'])
                    ->latest('id')
                    ->first();

                if ($active !== null) {
                    return response()->json([
                        'message' => 'A supplier catalog import is already running.',
                        'run' => $this->runData($active),
                    ], 409);
                }

                $run = DropShippingImportRun::create([
                    'status' => 'queued',
                    'page_from' => (int) ($filters['page_from'] ?? 1),
                    'page_to' => isset($filters['page_to']) ? (int) $filters['page_to'] : null,
                    'category_id' => filled($filters['category_id'] ?? null) ? trim($filters['category_id']) : null,
                    'started_by' => $request->user()->id,
                ]);

                ImportDropShippingCatalogPage::dispatch($run->id, $run->page_from)->onQueue('imports')->afterCommit();

                return $run;
            });

            if ($run instanceof JsonResponse) return $run;

            return response()->json([
                'message' => 'Supplier catalog import queued. All imported products will remain drafts.',
                'run' => $this->runData($run),
            ], 202);
        } finally {
            $lock->release();
        }
    }

    /** Current/latest supplier import progress for the admin screen. */
    public function dropshippingStatus(Request $request): JsonResponse
    {
        abort_unless($request->user()?->can('products.create'), 403);

        $configured = filled(config('services.dropshipping.api_key'))
            && filled(config('services.dropshipping.secret_key'));

        // No catalog run can be started without credentials. Avoid touching
        // the import tables in this state so a missing/old schema cannot turn
        // the actionable configuration warning into a generic 500 response.
        if (! $configured) {
            return response()->json([
                'configured' => false,
                'run' => null,
                'categories' => [],
            ]);
        }

        if (! Schema::hasTable('dropshipping_import_runs')
            || ! Schema::hasColumns('dropshipping_import_runs', ['page_from', 'page_to', 'category_id', 'status'])) {
            return response()->json([
                'message' => 'Supplier import database migrations are pending. Run php artisan migrate --force on the live server.',
            ], 503);
        }

        $run = DropShippingImportRun::query()->latest('id')->first();
        $categories = [];

        if (Schema::hasTable('dropshipping_catalog_items')) {
            try {
                $categories = $this->supplierCategories();
            } catch (\Throwable $exception) {
                // Category choices are optional. Keep status and page-range
                // imports usable even if an older database has catalog rows
                // in a schema this version does not recognize.
                Log::warning('Could not load DropShipping category options.', [
                    'exception' => $exception::class,
                ]);
            }
        }

        return response()->json([
            'configured' => $configured,
            'run' => $run === null ? null : $this->runData($run),
            'categories' => $categories,
        ]);
    }

    /** @return array<int, array{id: string, name: string}> */
    private function supplierCategories(): array
    {
        $ids = DB::table('dropshipping_catalog_items')
            ->whereNotNull('provider_category_id')
            ->distinct()
            ->orderBy('provider_category_id')
            ->pluck('provider_category_id');

        return $ids->map(function ($categoryId): array {
                $payloadValue = DB::table('dropshipping_catalog_items')
                    ->where('provider_category_id', $categoryId)
                    ->value('source_payload');
                $payload = is_array($payloadValue) ? $payloadValue : json_decode((string) $payloadValue, true);
                $name = data_get($payload, 'category_name') ?? data_get($payload, 'category.name');
                $id = (string) $categoryId;

                return ['id' => $id, 'name' => filled($name) ? (string) $name : "Supplier category {$id}"];
            })
            ->sortBy('name', SORT_NATURAL | SORT_FLAG_CASE)
            ->values()
            ->all();
    }

    /** @return array<string, mixed> */
    private function runData(DropShippingImportRun $run): array
    {
        return [
            'id' => $run->id,
            'status' => $run->status,
            'page_from' => $run->page_from,
            'page_to' => $run->page_to,
            'category_id' => $run->category_id,
            'current_page' => $run->current_page,
            'last_page' => $run->last_page,
            'created_count' => $run->created_count,
            'skipped_count' => $run->skipped_count,
            'failed_count' => $run->failed_count,
            'error' => $run->error,
            'started_at' => $run->started_at,
            'finished_at' => $run->finished_at,
        ];
    }

    /**
     * Read a supplier's price list.
     *
     * `dry_run` is the default in the admin panel: a person should see what a
     * file is going to do to their catalogue before it does it.
     */
    public function csv(Request $request): JsonResponse
    {
        abort_unless($request->user()?->can('products.create'), 403);

        $data = $request->validate([
            // Not `file|mimes:csv` -- a CSV exported by Excel is sniffed as
            // text/plain, application/csv, or occasionally application/vnd.ms-excel
            // depending on the machine that made it, and rejecting the file
            // for that would be maddening. The parser validates the content.
            'file' => ['required', 'file', 'max:8192'],
            'dry_run' => ['sometimes', 'boolean'],
            'create_missing' => ['sometimes', 'boolean'],
            'update_existing' => ['sometimes', 'boolean'],
            'default_status' => ['sometimes', 'in:draft,active,archived'],
            'default_category_id' => ['nullable', 'integer', 'exists:categories,id'],
        ]);

        $summary = $this->csv->run($request->file('file')->getRealPath(), [
            'dry_run' => $request->boolean('dry_run'),
            'create_missing' => $request->boolean('create_missing'),
            'update_existing' => $request->boolean('update_existing', true),
            'default_status' => $data['default_status'] ?? 'draft',
            'default_category_id' => $data['default_category_id'] ?? null,
        ]);

        return response()->json([
            'message' => $summary['dry_run']
                ? "{$summary['rows']} row(s) read: {$summary['created']} would be created, {$summary['updated']} updated, {$summary['failed']} could not be read."
                : "{$summary['created']} product(s) created, {$summary['updated']} updated, {$summary['failed']} failed.",
            'summary' => $summary,
        ]);
    }

    /**
     * A blank file with the headings this reader understands.
     *
     * Shipping the template is what stops the support conversation about
     * which column is which: the supplier's own file gets pasted into this
     * one, and the aliases cover the rest.
     */
    public function template(Request $request): StreamedResponse
    {
        abort_unless($request->user()?->can('products.create'), 403);

        $headings = ['Name', 'SKU', 'Category', 'Brand', 'Unit', 'Price', 'Compare at price', 'Special price', 'Short description', 'Description', 'Weight', 'Warranty', 'Barcode', 'Status', 'Images'];

        $example = ['1N4007 1A 1000V Rectifier Diode', 'DIO-1N4007', 'Diodes', 'Generic', 'pcs', '2.00', '3.00', '', 'Standard rectifier diode', 'DO-41 package, 1A forward current.', '0.002', '', '', 'draft', 'https://example.com/photo.jpg|https://example.com/photo-2.jpg'];

        return response()->streamDownload(function () use ($headings, $example): void {
            $out = fopen('php://output', 'w');

            // Excel opens a UTF-8 CSV as the system codepage unless the BOM
            // is there, which turns every Bangla product name into rubbish.
            fwrite($out, "\xEF\xBB\xBF");

            fputcsv($out, $headings, ',', '"', '');
            fputcsv($out, $example, ',', '"', '');

            fclose($out);
        }, 'upokoron-product-import-template.csv', [
            'Content-Type' => 'text/csv; charset=UTF-8',
        ]);
    }
}
