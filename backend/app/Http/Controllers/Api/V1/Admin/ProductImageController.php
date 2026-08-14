<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\Media;
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

        /*
         * Three ways in, in order of preference:
         *
         *   media_id  from the library -- the admin panel's route. The file
         *             is already stored and de-duplicated, so the same photo
         *             on six products is kept once.
         *   image     a direct upload, for a one-off.
         *   url       externally hosted, so a shop can list products before
         *             it has any uploads at all.
         */
        $request->validate([
            'media_id' => ['required_without_all:image,url', 'integer', 'exists:media,id'],
            'image' => ['required_without_all:media_id,url', 'file', 'image', 'max:4096'],
            'url' => ['required_without_all:media_id,image', 'url', 'max:255'],
            'alt' => ['nullable', 'string', 'max:200'],
        ]);

        $alt = $request->input('alt');

        $image = match (true) {
            $request->filled('media_id') => $this->images->attachMedia(
                $product,
                Media::findOrFail($request->integer('media_id')),
                $alt,
            ),
            $request->hasFile('image') => $this->images->upload($product, $request->file('image'), $alt),
            default => $this->images->attachUrl($product, $request->string('url')->value(), $alt),
        };

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
