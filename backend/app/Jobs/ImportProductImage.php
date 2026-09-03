<?php

declare(strict_types=1);

namespace App\Jobs;

use App\Models\Product;
use App\Services\Catalog\Import\ProductImageImporter;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Download one imported picture, later.
 *
 * A CSV of 300 products is 300 downloads from someone else's server, and no
 * web request should sit through that. The single-product import path calls
 * the importer directly instead -- there the admin is watching the form and
 * wants the pictures on it now.
 *
 * NOTE: this needs a queue worker running (`php artisan queue:work`), the
 * same one password-reset mail already depends on.
 */
class ImportProductImage implements ShouldQueue
{
    use Queueable;

    public int $tries = 3;

    /** Someone else's server being briefly down is the common failure, so back off rather than give up. */
    public array $backoff = [10, 60];

    public function __construct(
        public readonly int $productId,
        public readonly string $url,
        public readonly ?string $alt = null,
    ) {}

    public function handle(ProductImageImporter $importer): void
    {
        $product = Product::find($this->productId);

        if ($product === null) {
            return; // Deleted between the import and the worker picking this up.
        }

        $importer->import($product, $this->url, $this->alt);
    }

    /**
     * A picture that will not download is not worth failing an import over.
     *
     * The product is already created and correct; it is missing a photograph,
     * which the admin can see for themselves and fix by uploading one.
     */
    public function failed(?Throwable $exception): void
    {
        Log::warning('Product image import failed.', [
            'product_id' => $this->productId,
            'url' => $this->url,
            'reason' => $exception?->getMessage(),
        ]);
    }
}
