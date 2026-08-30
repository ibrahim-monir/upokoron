<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Category;
use App\Models\Product;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Cache;

class SitemapController extends Controller
{
    /**
     * XML sitemap for search engines.
     *
     * Built from the same visibility rules the storefront itself uses --
     * draft/archived products and inactive categories never earn a URL here,
     * so nothing gets submitted to Search Console that a visitor would 404 on.
     */
    public function __invoke(): Response
    {
        $xml = Cache::remember('sitemap.xml', now()->addHour(), function (): string {
            $baseUrl = rtrim((string) config('app.frontend_url'), '/');

            $staticPaths = [
                ['path' => '/', 'priority' => '1.0', 'changefreq' => 'daily'],
                ['path' => '/products', 'priority' => '0.8', 'changefreq' => 'daily'],
                ['path' => '/about', 'priority' => '0.5', 'changefreq' => 'monthly'],
                ['path' => '/contact', 'priority' => '0.5', 'changefreq' => 'monthly'],
                ['path' => '/rewards', 'priority' => '0.5', 'changefreq' => 'monthly'],
                ['path' => '/privacy', 'priority' => '0.3', 'changefreq' => 'yearly'],
                ['path' => '/terms', 'priority' => '0.3', 'changefreq' => 'yearly'],
            ];

            $categories = Category::query()
                ->active()
                ->get(['slug', 'updated_at']);

            $products = Product::query()
                ->published()
                ->get(['slug', 'updated_at']);

            return view('sitemap', [
                'baseUrl' => $baseUrl,
                'staticPaths' => $staticPaths,
                'categories' => $categories,
                'products' => $products,
            ])->render();
        });

        return response($xml, 200)->header('Content-Type', 'application/xml; charset=UTF-8');
    }
}
