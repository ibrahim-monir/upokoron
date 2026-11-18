<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\DropShippingCatalogItem;
use App\Models\DropShippingImportRun;
use App\Services\Catalog\Dropshipping\DropshippingClient;
use App\Services\Catalog\Dropshipping\DropshippingSettings;
use App\Services\Catalog\Dropshipping\DropshippingSync;
use App\Services\Catalog\Dropshipping\DropshippingSyncRunner;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\Rule;
use Throwable;

/**
 * The DropShipping.com.bd reseller panel: settings, connection test and sync
 * control for the admin Import page. The panel password is write-only here.
 */
class DropshippingController extends Controller
{
    public function __construct(
        private readonly DropshippingSettings $settings,
        private readonly DropshippingSyncRunner $runner,
    ) {}

    public function status(Request $request): JsonResponse
    {
        abort_unless($request->user()?->can('products.create'), 403);

        if (! Schema::hasColumns('dropshipping_import_runs', ['provider', 'source_index'])
            || ! Schema::hasColumns('dropshipping_catalog_items', ['product_code', 'in_stock'])) {
            return response()->json([
                'message' => 'Supplier sync database migrations are pending. Run php artisan migrate --force on the server.',
            ], 503);
        }

        $run = $this->runner->active() ?? $this->runner->latest();

        return response()->json([
            'configured' => $this->settings->configured(),
            'settings' => $this->settings->forDisplay(),
            'sources' => array_map(fn (array $s) => $s['label'], $this->settings->sources()),
            'run' => $run === null ? null : $this->runData($run),
            'counts' => $this->runner->counts(),
            'next_auto_sync_due' => $this->runner->due(),
        ]);
    }

    public function saveSettings(Request $request): JsonResponse
    {
        abort_unless($request->user()?->can('products.create'), 403);

        $data = $request->validate([
            'phone' => ['sometimes', 'nullable', 'string', 'max:30'],
            'password' => ['sometimes', 'nullable', 'string', 'max:200'],
            'sources' => ['sometimes', 'nullable', 'string', 'max:5000'],
            'auto_sync' => ['sometimes', 'boolean'],
            'interval_hours' => ['sometimes', 'integer', 'min:1', 'max:48'],
            'import_new' => ['sometimes', 'boolean'],
            'new_status' => ['sometimes', Rule::in(['draft', 'active'])],
            'price_field' => ['sometimes', Rule::in(['reselling_price', 'price'])],
            'compare_at_from_regular' => ['sometimes', 'boolean'],
            'hide_out_of_stock' => ['sometimes', 'boolean'],
            'max_images' => ['sometimes', 'integer', 'min:1', 'max:10'],
            'site_code' => ['sometimes', 'string', 'regex:/^[0-9A-Za-z]{1,6}$/'],
        ]);

        if (array_key_exists('phone', $data)) {
            $data['phone'] = trim((string) $data['phone']);
        }
        if (array_key_exists('sources', $data)) {
            $data['sources'] = trim((string) $data['sources']);
        }

        $loginChanged = array_key_exists('phone', $data) && $data['phone'] !== $this->settings->get('phone')
            || filled($data['password'] ?? null);

        $this->settings->save($data);
        if ($loginChanged) {
            app(DropshippingClient::class)->forget();
        }

        return response()->json([
            'message' => 'Supplier settings saved.',
            'settings' => $this->settings->forDisplay(),
            'sources' => array_map(fn (array $s) => $s['label'], $this->settings->sources()),
        ]);
    }

    /** Log in and read the first page of the first source. Saves nothing. */
    public function test(Request $request, DropshippingClient $client, DropshippingSync $sync): JsonResponse
    {
        abort_unless($request->user()?->can('products.create'), 403);

        $sources = $this->settings->sources();
        if ($sources === []) {
            return response()->json(['message' => 'Add at least one panel category to Sources.'], 422);
        }

        try {
            $client->login();
            $listing = $client->listPage($sources[0]['params'], 1);
            $top = $client->listPage([], 1);
        } catch (Throwable $e) {
            Log::warning('DropShipping.com.bd connection test failed.', ['error' => $e->getMessage()]);

            return response()->json(['message' => $e->getMessage()], 422);
        }

        $codes = array_map(fn ($r) => (string) ($r['product_code'] ?? ''), $listing['items']);
        $linked = DropShippingCatalogItem::query()
            ->where('provider', DropshippingSync::PROVIDER)
            ->whereIn('product_code', $codes)
            ->pluck('product_code')
            ->all();

        $rows = array_map(fn (array $r) => [
            'code' => (string) ($r['product_code'] ?? ''),
            'name' => mb_substr(trim(strip_tags((string) ($r['name'] ?? ''))), 0, 120),
            'price' => $sync->retailPrice($r),
            'cost' => $r['sale_price'] ?? null,
            'stock' => $r['stock'] ?? null,
            'in_stock' => $sync->inStock($r),
            'linked' => in_array((string) ($r['product_code'] ?? ''), $linked, true),
        ], array_slice($listing['items'], 0, 15));

        return response()->json([
            'message' => "Connected. {$sources[0]['label']}: {$listing['total']} product(s) on the panel.",
            'source' => $sources[0]['label'],
            'total' => $listing['total'],
            'rows' => $rows,
            'panel_categories' => collect($top['categories'])->map(fn ($name, $id) => ['id' => (string) $id, 'name' => $name])->values(),
            'sub_categories' => collect($listing['sub_categories'])->map(fn ($name, $id) => ['id' => (string) $id, 'name' => $name])->values(),
        ]);
    }

    public function start(Request $request): JsonResponse
    {
        abort_unless($request->user()?->can('products.create'), 403);

        try {
            $run = $this->runner->start('manual', $request->user()->id);
        } catch (Throwable $e) {
            return response()->json(['message' => $e->getMessage()], 409);
        }

        return response()->json([
            'message' => 'Sync queued. New products arrive as '.$this->settings->get('new_status').'s; prices and stock update on every run.',
            'run' => $this->runData($run),
        ], 202);
    }

    public function cancel(Request $request): JsonResponse
    {
        abort_unless($request->user()?->can('products.create'), 403);

        $run = $this->runner->cancel();

        return response()->json([
            'message' => $run ? 'Sync stopped.' : 'No sync was running.',
            'run' => $run ? $this->runData($run->refresh()) : null,
        ]);
    }

    /** @return array<string, mixed> */
    private function runData(DropShippingImportRun $run): array
    {
        return $run->only([
            'id', 'status', 'trigger', 'source_index', 'source_count', 'current_page', 'last_page',
            'created_count', 'updated_count', 'skipped_count', 'hidden_count', 'failed_count', 'seen_count',
            'total_count', 'error', 'started_at', 'finished_at',
        ]);
    }
}
