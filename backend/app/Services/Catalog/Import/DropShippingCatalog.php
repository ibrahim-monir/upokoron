<?php

declare(strict_types=1);

namespace App\Services\Catalog\Import;

use Illuminate\Support\Facades\Http;
use Symfony\Component\HttpKernel\Exception\HttpException;

/** Read-only adapter for the reseller's paginated product catalog. */
class DropShippingCatalog
{
    /** Fetch every supplier page in order, stopping at the advertised last page.
     *
     * @return \Generator<int, array{products: array<int, array<string, mixed>>, page: int, last_page: int}>
     */
    public function allPages(): \Generator
    {
        $page = 1;

        while (true) {
            $batch = $this->page($page);
            yield $batch;

            if ($page >= $batch['last_page']) {
                break;
            }

            $page++;
        }
    }

    /** @return array{products: array<int, array<string, mixed>>, page: int, last_page: int} */
    public function page(int $page): array
    {
        $apiKey = config('services.dropshipping.api_key');
        $secretKey = config('services.dropshipping.secret_key');

        if (! is_string($apiKey) || $apiKey === '' || ! is_string($secretKey) || $secretKey === '') {
            throw new HttpException(503, 'The supplier catalog is not configured on this server.');
        }

        try {
            $response = Http::acceptJson()
                ->withHeaders(['api-key' => $apiKey, 'secret-key' => $secretKey])
                ->connectTimeout(5)
                ->timeout(20)
                ->get(config('services.dropshipping.catalog_url'), ['page' => $page]);
        } catch (\Throwable) {
            throw new HttpException(502, 'Could not connect to the supplier catalog. Please try again.');
        }

        if (! $response->successful()) {
            throw new HttpException(502, 'The supplier catalog rejected the request. Check its API credentials and try again.');
        }

        $payload = $response->json();
        $rawProducts = data_get($payload, 'products');

        if (! is_array($payload) || ! is_array($rawProducts)) {
            throw new HttpException(502, 'The supplier catalog returned an unexpected response.');
        }

        $lastPage = (int) (data_get($payload, 'last_page')
            ?? data_get($payload, 'pagination.last_page')
            ?? data_get($payload, 'meta.last_page')
            ?? 1);
        $lastPage = max(1, $lastPage);
        $imageBase = rtrim((string) config('services.dropshipping.image_base_url'), '/');

        return [
            'products' => array_values(array_filter(array_map(
                fn ($product) => is_array($product) ? $this->normalize($product, $imageBase) : null,
                $rawProducts,
            ))),
            'page' => $page,
            'last_page' => $lastPage,
        ];
    }

    /** @param array<string, mixed> $product
     *  @return array<string, mixed>|null
     */
    private function normalize(array $product, string $imageBase): ?array
    {
        $id = $product['id'] ?? null;
        $name = trim((string) ($product['name'] ?? ''));

        if ($name === '') {
            return null;
        }

        $images = [];
        $rawImages = $product['product_image'] ?? [];
        if (! is_array($rawImages)) $rawImages = [$rawImages];
        if (filled($product['thumbnail_img'] ?? null)) $rawImages[] = $product['thumbnail_img'];

        foreach ($rawImages as $image) {
            $path = is_array($image) ? ($image['product_image'] ?? null) : $image;
            if (! is_string($path) || trim($path) === '') {
                continue;
            }

            $images[] = str_starts_with($path, 'http://') || str_starts_with($path, 'https://')
                ? $path
                : $imageBase.'/'.ltrim($path, '/');
        }

        $details = html_entity_decode(strip_tags((string) ($product['details'] ?? '')), ENT_QUOTES | ENT_HTML5, 'UTF-8');

        return [
            'id' => $id,
            'name' => $name,
            'sku' => (string) ($product['product_code'] ?? ''),
            'category_id' => $product['category_id'] ?? null,
            'category_name' => $product['category_name'] ?? data_get($product, 'category.name'),
            'slug' => (string) ($product['slug'] ?? ''),
            'details' => trim($details),
            'price' => $product['price'] ?? null,
            'discount' => $product['discount'] ?? null,
            'reselling_price' => $product['reselling_price'] ?? null,
            'sale_price' => $product['sale_price'] ?? null,
            'status' => $product['status'] ?? null,
            'images' => array_values(array_unique($images)),
            // Keep source-side option IDs and other fields intact so a later
            // mapping layer can use the full provider record without losing data.
            'product_attribute' => $product['product_attribute'] ?? [],
            'product_variant' => $product['product_variant'] ?? [],
            'thumbnail_img' => $product['thumbnail_img'] ?? null,
            'source_payload' => $product,
        ];
    }
}
