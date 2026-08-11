<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\Product;
use App\Models\ProductImage;
use App\Services\Catalog\ProductImageService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ProductImageController extends Controller
{
    public function __construct(private readonly ProductImageService $images) {}

    public function store(Request $request, Product $product): JsonResponse
    {
        abort_unless($request->user()?->can('products.update'), 403);

        $request->validate([
            'image' => ['required_without:url', 'file', 'image', 'max:4096'],
            'url' => ['required_without:image', 'url', 'max:255'],
            'alt' => ['nullable', 'string', 'max:200'],
        ]);

        $image = $request->hasFile('image')
            ? $this->images->upload($product, $request->file('image'), $request->input('alt'))
            : $this->images->attachUrl($product, $request->string('url')->value(), $request->input('alt'));

        return response()->json([
            'message' => 'Image added.',
            'image' => ['id' => $image->id, 'url' => $image->url(), 'is_primary' => $image->is_primary],
        ], 201);
    }

    public function destroy(Request $request, Product $product, ProductImage $image): JsonResponse
    {
        abort_unless($request->user()?->can('products.update'), 403);
        abort_unless($image->product_id === $product->id, 404);

        $this->images->delete($image);

        return response()->json(['message' => 'Image removed.']);
    }

    public function makePrimary(Request $request, Product $product, ProductImage $image): JsonResponse
    {
        abort_unless($request->user()?->can('products.update'), 403);
        abort_unless($image->product_id === $product->id, 404);

        $this->images->makePrimary($image);

        return response()->json(['message' => 'Primary image updated.']);
    }

    public function reorder(Request $request, Product $product): JsonResponse
    {
        abort_unless($request->user()?->can('products.update'), 403);

        $validated = $request->validate([
            'image_ids' => ['required', 'array', 'min:1'],
            'image_ids.*' => ['integer'],
        ]);

        $this->images->reorder($product, $validated['image_ids']);

        return response()->json(['message' => 'Images reordered.']);
    }
}
