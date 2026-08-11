<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1\Shop;

use App\Http\Controllers\Controller;
use App\Http\Resources\ProductResource;
use App\Models\Category;
use App\Models\Product;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class ProductController extends Controller
{
    /**
     * Public storefront product listing.
     */
    public function index(Request $request): AnonymousResourceCollection
    {
        $perPage = min(
            max($request->integer('per_page', 20), 1),
            48
        );

        $products = Product::query()
            ->published()
            ->with([
                'category:id,name,slug',
                'brand:id,name,slug',
                'primaryImage',
                'defaultVariation',
            ])
            ->withCount('variations')

            // Search by product name, SKU or barcode.
            ->when($request->filled('search'), function ($query) use ($request): void {
                $term = '%' . $request->string('search')->trim() . '%';

                $query->where(function ($q) use ($term): void {
                    $q->where('name', 'like', $term)
                        ->orWhereHas('variations', function ($variation) use ($term): void {
                            $variation
                                ->where('sku', 'like', $term)
                                ->orWhere('barcode', 'like', $term);
                        });
                });
            })

            // Filter by category slug.
            ->when($request->filled('category'), function ($query) use ($request): void {
                $category = Category::query()
                    ->where('slug', $request->string('category')->trim())
                    ->first();

                if ($category !== null) {
                    $query->inCategory($category);
                } else {
                    $query->whereRaw('1 = 0');
                }
            })

            // Optional product type filter.
            ->when(
                $request->filled('type'),
                fn ($query) => $query->where(
                    'type',
                    $request->string('type')->trim()
                )
            )

            // Featured products only.
            ->when(
                $request->boolean('featured'),
                fn ($query) => $query->where('is_featured', true)
            )

            // Basic sorting.
            ->when(
                $request->string('sort')->value() === 'oldest',
                fn ($query) => $query->oldest('id')
            )
            ->when(
                $request->string('sort')->value() === 'name',
                fn ($query) => $query->orderBy('name')
            )
            ->when(
                $request->string('sort')->value() === 'name_desc',
                fn ($query) => $query->orderByDesc('name')
            )

            // Default: newest products first.
            ->when(
                ! in_array(
                    $request->string('sort')->value(),
                    ['oldest', 'name', 'name_desc'],
                    true
                ),
                fn ($query) => $query->latest('id')
            )

            ->paginate($perPage)
            ->withQueryString();

        return ProductResource::collection($products);
    }

    /**
     * Public storefront product details.
     *
     * Products are resolved by slug and must currently be published.
     */
    public function show(Product $product): ProductResource
    {
        abort_unless(
            $product->status->value === 'active'
            && (
                $product->published_at === null
                || $product->published_at->lte(now())
            ),
            404
        );

        $product->load([
            'category',
            'brand',
            'unit',
            'categories',
            'images',
            'primaryImage',
            'variations.attributeValues.attribute',
            'defaultVariation.attributeValues.attribute',
            'attributeValues.attribute',
        ]);

        return new ProductResource($product);
    }
}