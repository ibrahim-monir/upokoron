<?php

declare(strict_types=1);

namespace App\Services\Support;

use App\Models\Category;
use App\Models\Product;
use Illuminate\Support\Facades\Cache;

/**
 * Builds the sitemap's URL entries, one flat list per content type, so the
 * controller can slice each into fixed-size batches without knowing where
 * the URLs came from.
 *
 * "Posts" has no backing model yet -- the segment is wired up ahead of that
 * feature so the sitemap index's shape does not change the day it lands.
 */
class SitemapService
{
    public const BATCH_SIZE = 200;

    private const CACHE_KEY = 'sitemap.data';

    /**
     * @return array<string, string> segment key => label
     */
    public static function segments(): array
    {
        return [
            'pages' => 'Pages',
            'posts' => 'Posts',
            'product-categories' => 'Product categories',
            'products' => 'Products',
        ];
    }

    /**
     * Every URL entry, grouped by segment. Cached together since they are
     * always rebuilt from the same handful of queries.
     *
     * @return array<string, array<int, array{loc: string, lastmod: ?string, changefreq: string, priority: string}>>
     */
    public function all(): array
    {
        return Cache::remember(self::CACHE_KEY, now()->addHour(), fn (): array => [
            'pages' => $this->pages(),
            'posts' => $this->posts(),
            'product-categories' => $this->productCategories(),
            'products' => $this->products(),
        ]);
    }

    public function isCached(): bool
    {
        return Cache::has(self::CACHE_KEY);
    }

    public function forget(): void
    {
        Cache::forget(self::CACHE_KEY);
    }

    /**
     * A segment's URLs, split into pages of at most BATCH_SIZE entries.
     *
     * @return array<int, array<int, array{loc: string, lastmod: ?string, changefreq: string, priority: string}>>
     */
    public function batches(string $segment): array
    {
        return array_chunk($this->all()[$segment] ?? [], self::BATCH_SIZE);
    }

    private function baseUrl(): string
    {
        return rtrim((string) config('app.frontend_url'), '/');
    }

    /**
     * @return array<int, array{loc: string, lastmod: ?string, changefreq: string, priority: string}>
     */
    private function pages(): array
    {
        $baseUrl = $this->baseUrl();

        $paths = [
            ['path' => '/', 'priority' => '1.0', 'changefreq' => 'daily'],
            ['path' => '/products', 'priority' => '0.8', 'changefreq' => 'daily'],
            ['path' => '/about', 'priority' => '0.5', 'changefreq' => 'monthly'],
            ['path' => '/contact', 'priority' => '0.5', 'changefreq' => 'monthly'],
            ['path' => '/rewards', 'priority' => '0.5', 'changefreq' => 'monthly'],
            ['path' => '/privacy', 'priority' => '0.3', 'changefreq' => 'yearly'],
            ['path' => '/terms', 'priority' => '0.3', 'changefreq' => 'yearly'],
        ];

        return array_map(static fn (array $entry): array => [
            'loc' => $baseUrl.$entry['path'],
            'lastmod' => null,
            'changefreq' => $entry['changefreq'],
            'priority' => $entry['priority'],
        ], $paths);
    }

    /**
     * @return array<int, array{loc: string, lastmod: ?string, changefreq: string, priority: string}>
     */
    private function posts(): array
    {
        return [];
    }

    /**
     * @return array<int, array{loc: string, lastmod: ?string, changefreq: string, priority: string}>
     */
    private function productCategories(): array
    {
        $baseUrl = $this->baseUrl();

        return Category::query()
            ->active()
            ->get(['slug', 'updated_at'])
            ->map(static fn (Category $category): array => [
                'loc' => "{$baseUrl}/category/{$category->slug}",
                'lastmod' => $category->updated_at?->toAtomString(),
                'changefreq' => 'weekly',
                'priority' => '0.7',
            ])
            ->all();
    }

    /**
     * @return array<int, array{loc: string, lastmod: ?string, changefreq: string, priority: string}>
     */
    private function products(): array
    {
        $baseUrl = $this->baseUrl();

        return Product::query()
            ->published()
            ->get(['slug', 'updated_at'])
            ->map(static fn (Product $product): array => [
                'loc' => "{$baseUrl}/products/{$product->slug}",
                'lastmod' => $product->updated_at?->toAtomString(),
                'changefreq' => 'weekly',
                'priority' => '0.6',
            ])
            ->all();
    }
}
