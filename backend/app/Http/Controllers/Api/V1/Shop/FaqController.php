<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1\Shop;

use App\Http\Controllers\Controller;
use App\Models\Faq;
use Illuminate\Http\JsonResponse;

class FaqController extends Controller
{
    /**
     * The published questions, in the order the owner arranged them.
     *
     * Empty until someone writes one, and the storefront draws no section
     * for an empty list rather than showing a heading over nothing.
     */
    public function index(): JsonResponse
    {
        return response()->json([
            'data' => Faq::active()->ordered()->get(['id', 'question', 'answer']),
        ]);
    }
}
