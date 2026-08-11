<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1\Admin;

use App\Enums\ProductStatus;
use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\StoreProductRequest;
use App\Http\Resources\ProductResource;
use App\Models\Category;
use App\Models\Product;
use App\Services\Catalog\ProductService;
use App\Services\Catalog\VariationGenerator;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class ProductController extends Controller
{
    public function __construct(private readonly ProductService $products) {}

    public function index(Request $request): AnonymousResourceCollection
    {
        abort_unless($request->user()?->can('products.view'), 403);

        $products = Product::query()
            // `slug` is in the select because ProductResource renders it. A
            // partial select that omits a column the resource reads is an
            // extra query per row in production, and a hard failure under the
            // strict models this project runs in dev and test.
            ->with(['category:id,name,slug', 'brand:id,name,slug', 'primaryImage', 'defaultVariation'])
            ->withCount('variations')
            ->when($request->filled('search'), function ($q) use ($request): void {
                $term = '%'.$request->string('search')->value().'%';
                $q->where(fn ($w) => $w->where('name', 'like', $term)
                    ->orWhereHas('variations', fn ($v) => $v->where('sku', 'like', $term)
                        ->orWhere('barcode', 'like', $term)));
            })
            ->when($request->filled('category_id'), function ($q) use ($request): void {
                $category = Category::find($request->integer('category_id'));
                if ($category !== null) {
                    $q->inCategory($category);
                }
            })
            ->when($request->filled('brand_id'), fn ($q) => $q->where('brand_id', $request->integer('brand_id')))
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->string('status')->value()))
            ->when($request->filled('type'), fn ($q) => $q->where('type', $request->string('type')->value()))
            ->when($request->boolean('featured'), fn ($q) => $q->where('is_featured', true))
            ->when($request->boolean('trashed'), fn ($q) => $q->onlyTrashed())
            ->latest('id')
            ->paginate($request->integer('per_page', 20));

        return ProductResource::collection($products);
    }

    public function store(StoreProductRequest $request): JsonResponse
    {
        abort_unless($request->user()?->can('products.create'), 403);

        $product = $this->products->create($request->validated());

        return response()->json([
            'message' => "Product [{$product->name}] created with {$product->variations->count()} variation(s).",
            'product' => new ProductResource($product),
        ], 201);
    }

    public function show(Request $request, Product $product): ProductResource
    {
        abort_unless($request->user()?->can('products.view'), 403);

        return new ProductResource($product->load([
            'category', 'brand', 'unit', 'categories', 'images',
            'variations.attributeValues.attribute',
            'attributeValues.attribute',
        ]));
    }

    public function update(StoreProductRequest $request, Product $product): JsonResponse
    {
        abort_unless($request->user()?->can('products.update'), 403);

        $updated = $this->products->update($product, $request->validated());

        return response()->json([
            'message' => 'Product updated.',
            'product' => new ProductResource($updated),
        ]);
    }

    /**
     * Soft delete only.
     *
     * By Phase 8 a product will be referenced by order items and stock ledger
     * rows. Removing the row would orphan a customer's order history, so the
     * product is archived and withdrawn from sale instead.
     */
    public function destroy(Request $request, Product $product): JsonResponse
    {
        abort_unless($request->user()?->can('products.delete'), 403);

        $product->update(['status' => ProductStatus::Archived]);
        $product->delete();

        return response()->json([
            'message' => "[{$product->name}] archived and withdrawn from sale. Its history is kept.",
        ]);
    }

    public function restore(Request $request, int $id): JsonResponse
    {
        abort_unless($request->user()?->can('products.delete'), 403);

        $product = Product::onlyTrashed()->findOrFail($id);
        $product->restore();
        $product->update(['status' => ProductStatus::Draft]);

        return response()->json([
            'message' => "[{$product->name}] restored as a draft.",
            'product' => new ProductResource($product->load('variations')),
        ]);
    }

    /**
     * Preview the variations a given attribute selection would produce,
     * before committing to creating them.
     */
    public function previewVariations(Request $request): JsonResponse
    {
        abort_unless($request->user()?->can('products.create'), 403);

        $request->validate([
            'attributes' => ['required', 'array'],
            'attributes.*' => ['array', 'min:1'],
            'attributes.*.*' => ['integer'],
        ]);

        $generator = app(VariationGenerator::class);
        $selection = $request->input('attributes');

        $values = $generator->resolveValues($selection);
        $combinations = $generator->combinations($selection);

        return response()->json([
            'count' => count($combinations),
            'data' => collect($combinations)->map(fn (array $c) => [
                'key' => $generator->key($c),
                'name' => implode(' / ', $generator->labels($c, $values)),
            ]),
        ]);
    }
}
