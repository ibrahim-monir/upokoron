<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Services\Support\SitemapService;
use Illuminate\Http\Response;

class SitemapController extends Controller
{
    public function __construct(private readonly SitemapService $sitemap)
    {
    }

    /**
     * The sitemap index: one <sitemap> entry per non-empty batch, so a
     * segment with no URLs (posts, until that feature exists) simply does
     * not appear rather than pointing crawlers at an empty file.
     */
    public function index(): Response
    {
        $baseUrl = rtrim((string) config('app.frontend_url'), '/');

        $refs = [];

        foreach (array_keys(SitemapService::segments()) as $segment) {
            foreach (array_keys($this->sitemap->batches($segment)) as $batchIndex) {
                $refs[] = "{$baseUrl}/sitemap-{$segment}-".($batchIndex + 1).'.xml';
            }
        }

        $xml = view('sitemap-index', ['refs' => $refs])->render();

        return response($xml, 200)->header('Content-Type', 'application/xml; charset=UTF-8');
    }

    /**
     * One batch of at most SitemapService::BATCH_SIZE URLs for a single
     * content type, e.g. /sitemap-products-2.xml.
     */
    public function show(string $segment, int $batch): Response
    {
        abort_unless(array_key_exists($segment, SitemapService::segments()), 404);

        $urls = $this->sitemap->batches($segment)[$batch - 1] ?? null;

        abort_if($urls === null, 404);

        $xml = view('sitemap-urlset', ['urls' => $urls])->render();

        return response($xml, 200)->header('Content-Type', 'application/xml; charset=UTF-8');
    }
}
