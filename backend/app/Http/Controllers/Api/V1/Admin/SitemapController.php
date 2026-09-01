<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Services\Support\SitemapService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SitemapController extends Controller
{
    public function __construct(private readonly SitemapService $sitemap)
    {
    }

    public function index(Request $request): JsonResponse
    {
        abort_unless($request->user()?->can('sitemap.manage'), 403);

        $baseUrl = rtrim((string) config('app.frontend_url'), '/');

        $segments = [];

        foreach (SitemapService::segments() as $key => $label) {
            $batches = $this->sitemap->batches($key);

            $segments[] = [
                'key' => $key,
                'label' => $label,
                'url_count' => array_sum(array_map('count', $batches)),
                'batches' => array_map(
                    static fn (int $index): string => "{$baseUrl}/sitemap-{$key}-".($index + 1).'.xml',
                    array_keys($batches),
                ),
            ];
        }

        return response()->json([
            'data' => [
                'index_url' => "{$baseUrl}/sitemap.xml",
                'batch_size' => SitemapService::BATCH_SIZE,
                'cached' => $this->sitemap->isCached(),
                'segments' => $segments,
            ],
        ]);
    }

    public function regenerate(Request $request): JsonResponse
    {
        abort_unless($request->user()?->can('sitemap.manage'), 403);

        $this->sitemap->forget();

        return response()->json(['message' => 'Sitemap will rebuild on the next request.']);
    }
}
