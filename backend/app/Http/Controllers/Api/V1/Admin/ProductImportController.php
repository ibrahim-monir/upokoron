<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Services\Catalog\Import\ProductCsvImporter;
use App\Services\Catalog\Import\ProductPageScraper;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
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
