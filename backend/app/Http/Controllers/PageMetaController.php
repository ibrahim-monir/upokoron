<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Models\Category;
use App\Models\Product;
use App\Models\ProductImage;
use App\Services\Support\SettingsService;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Throwable;

/**
 * The storefront's index.html, with this page's title, description, share
 * preview and structured data already in its <head>.
 *
 * The storefront is built in the browser, so without this every product
 * link arrives with the home page's title. Google runs the JavaScript and
 * eventually sees the right one, but Facebook, WhatsApp, Messenger and most
 * link previews never run it -- they read the HTML once and show whatever
 * is there. So product and category URLs are routed here (see
 * deploy/public_html.htaccess), which fills in the tags and hands back the
 * same page the browser would have got. Nothing else about it changes: the
 * app still boots and renders as usual.
 *
 * Fails safe. If anything goes wrong the plain index.html is served, so a
 * bug here costs a preview, never the page.
 */
class PageMetaController extends Controller
{
    public function __construct(private readonly SettingsService $settings) {}

    public function product(string $slug): Response
    {
        $html = $this->indexHtml();

        try {
            $product = Product::query()
                ->published()
                ->where('slug', $slug)
                ->with(['brand', 'images', 'primaryImage', 'defaultVariation.inventory'])
                ->first();

            if ($product === null) {
                return $this->respond($html, 404);
            }

            return $this->respond($this->inject($html, $this->productMeta($product)));
        } catch (Throwable $e) {
            Log::warning('Page meta failed for a product.', ['slug' => $slug, 'error' => $e->getMessage()]);

            return $this->respond($html);
        }
    }

    public function category(string $slug): Response
    {
        $html = $this->indexHtml();

        try {
            $category = Category::query()->active()->where('slug', $slug)->first();

            if ($category === null) {
                return $this->respond($html, 404);
            }

            $store = $this->storeName();
            $description = $this->plain($category->meta_description ?: $category->description)
                ?: "Shop {$category->name} at {$store}. Genuine products, cash on delivery across Bangladesh.";

            return $this->respond($this->inject($html, [
                'title' => ($category->meta_title ?: $category->name)." | {$store}",
                'description' => $description,
                'url' => $this->absolute("/category/{$category->slug}"),
                'image' => null,
                'type' => 'website',
                'jsonLd' => [
                    '@context' => 'https://schema.org',
                    '@type' => 'CollectionPage',
                    'name' => $category->name,
                    'description' => $description,
                    'url' => $this->absolute("/category/{$category->slug}"),
                ],
            ]));
        } catch (Throwable $e) {
            Log::warning('Page meta failed for a category.', ['slug' => $slug, 'error' => $e->getMessage()]);

            return $this->respond($html);
        }
    }

    /**
     * @return array<string, mixed>
     */
    private function productMeta(Product $product): array
    {
        $store = $this->storeName();
        $url = $product->canonical_url ?: $this->absolute("/products/{$product->slug}");

        $description = $this->plain($product->meta_description)
            ?: $this->plain($product->short_description)
            ?: $this->plain($product->description)
            ?: "Buy {$product->name} at {$store}. Cash on delivery across Bangladesh.";

        $images = $product->images->isNotEmpty()
            ? $product->images->map(fn (ProductImage $image): string => $this->absolute($image->url()))->values()->all()
            : ($product->primaryImage ? [$this->absolute($product->primaryImage->url())] : []);

        $variation = $product->defaultVariation;
        $price = $variation?->effectivePrice()->value();

        // Untracked products (made to order, services) can always be sold.
        $inStock = ! $product->is_stock_tracked
            || (float) ($variation?->inventory?->available_quantity ?? 0) > 0;

        $jsonLd = [
            '@context' => 'https://schema.org',
            '@type' => 'Product',
            'name' => $product->name,
            'description' => $description,
            'url' => $url,
            'image' => $images,
            'sku' => $variation?->sku,
            'brand' => $product->brand ? ['@type' => 'Brand', 'name' => $product->brand->name] : null,
            'offers' => $price === null ? null : [
                '@type' => 'Offer',
                'url' => $url,
                'priceCurrency' => 'BDT',
                'price' => $price,
                'availability' => $inStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
                'itemCondition' => 'https://schema.org/NewCondition',
                'seller' => ['@type' => 'Organization', 'name' => $store],
            ],
            'aggregateRating' => (int) $product->rating_count > 0 ? [
                '@type' => 'AggregateRating',
                'ratingValue' => (string) $product->rating_avg,
                'reviewCount' => (int) $product->rating_count,
            ] : null,
        ];

        return [
            'title' => ($product->meta_title ?: $product->name)." | {$store}",
            'description' => $description,
            'url' => $url,
            'image' => $images[0] ?? null,
            'type' => 'product',
            'price' => $price,
            'jsonLd' => array_filter($jsonLd, fn ($value): bool => $value !== null),
        ];
    }

    /**
     * @param  array<string, mixed>  $meta
     */
    private function inject(string $html, array $meta): string
    {
        $e = fn (?string $value): string => htmlspecialchars((string) $value, ENT_QUOTES | ENT_HTML5, 'UTF-8');

        // Out go the home page's own title and description...
        $html = preg_replace('~<title>.*?</title>~s', '<title>'.$e($meta['title']).'</title>', $html, 1) ?? $html;
        $html = preg_replace('~<meta\s+name="description"[^>]*>~s', '', $html, 1) ?? $html;
        $html = preg_replace('~\s*<meta\s+data-page-meta[^>]*>~s', '', $html) ?? $html;

        // ...and in go this page's. Tagged data-page-meta so the app can
        // replace them as the visitor moves between pages.
        $tags = [
            '<meta data-page-meta name="description" content="'.$e($meta['description']).'">',
            '<link data-page-meta rel="canonical" href="'.$e($meta['url']).'">',
            '<meta data-page-meta property="og:type" content="'.$e($meta['type']).'">',
            '<meta data-page-meta property="og:site_name" content="'.$e($this->storeName()).'">',
            '<meta data-page-meta property="og:title" content="'.$e($meta['title']).'">',
            '<meta data-page-meta property="og:description" content="'.$e($meta['description']).'">',
            '<meta data-page-meta property="og:url" content="'.$e($meta['url']).'">',
            '<meta data-page-meta name="twitter:card" content="'.($meta['image'] ? 'summary_large_image' : 'summary').'">',
        ];

        if ($meta['image']) {
            $tags[] = '<meta data-page-meta property="og:image" content="'.$e($meta['image']).'">';
        }

        if (! empty($meta['price'])) {
            $tags[] = '<meta data-page-meta property="product:price:amount" content="'.$e($meta['price']).'">';
            $tags[] = '<meta data-page-meta property="product:price:currency" content="BDT">';
        }

        // JSON_HEX_TAG so a "</script>" inside a product description cannot
        // close the tag early.
        $tags[] = '<script data-page-meta type="application/ld+json">'
            .json_encode($meta['jsonLd'], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_HEX_TAG)
            .'</script>';

        return str_replace('</head>', '    '.implode("\n    ", $tags)."\n  </head>", $html);
    }

    private function respond(string $html, int $status = 200): Response
    {
        return response($html, $status)
            ->header('Content-Type', 'text/html; charset=UTF-8')
            // Same rule as index.html itself: never cached, or a deploy
            // would ship to nobody.
            ->header('Cache-Control', 'no-cache, must-revalidate');
    }

    /**
     * The built storefront. In production it sits in public_html beside the
     * application folder; SPA_INDEX_PATH overrides that for other layouts.
     */
    private function indexHtml(): string
    {
        $candidates = array_filter([
            env('SPA_INDEX_PATH'),
            dirname(base_path()).'/public_html/index.html',
            base_path('../frontend/dist/index.html'),
        ]);

        foreach ($candidates as $path) {
            if (is_file($path)) {
                return (string) file_get_contents($path);
            }
        }

        abort(500, 'The storefront build (index.html) was not found.');
    }

    private function storeName(): string
    {
        return (string) ($this->settings->get('store_name') ?: config('app.name'));
    }

    private function absolute(string $pathOrUrl): string
    {
        if (Str::startsWith($pathOrUrl, ['http://', 'https://'])) {
            return $pathOrUrl;
        }

        return rtrim((string) config('app.url'), '/').'/'.ltrim($pathOrUrl, '/');
    }

    /** Text for a meta tag: no HTML, no runs of whitespace, about 160 characters. */
    private function plain(?string $text): string
    {
        // Tags become spaces first, so "<p>One</p><p>Two</p>" reads "One Two"
        // rather than "OneTwo".
        $text = (string) preg_replace('/<[^>]*>/', ' ', (string) $text);
        $text = trim((string) preg_replace('/\s+/u', ' ', html_entity_decode($text, ENT_QUOTES | ENT_HTML5, 'UTF-8')));

        return Str::limit($text, 160, '…');
    }
}
