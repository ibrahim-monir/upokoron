<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1\Shop;

use App\Http\Controllers\Controller;
use App\Models\Banner;
use Illuminate\Http\JsonResponse;

class BannerController extends Controller
{
    public function index(): JsonResponse
    {
        $banners = Banner::published()
            ->orderBy('position')
            ->orderBy('id')
            ->get(['id', 'link', 'theme', 'image']);

        return response()->json(['data' => $banners]);
    }
}
