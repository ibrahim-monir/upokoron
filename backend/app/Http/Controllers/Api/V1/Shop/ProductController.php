<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1\Shop;

use App\Enums\OrderStatus;
use App\Http\Controllers\Controller;
use App\Http\Resources\ProductResource;
use App\Models\Category;
use App\Models\Product;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\DB;

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
                // The stock row comes with it, so a listing can grey out what
                // is sold out instead of finding out one product page later.
                'defaultVariation.inventory',
            ])
            ->withCount('variations')

            // Search by product name, SKU or barcode.
            ->when($request->filled('search'), function ($query) use ($request): void {
                $term = '%'.$request->string('search')->trim().'%';

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
            'variations.inventory',
            'defaultVariation.attributeValues.attribute',
            'defaultVariation.inventory',
            'attributeValues.attribute',
        ]);

        return new ProductResource($product);
    }

    /**
     * What is actually selling at the moment.
     *
     * Counted from order lines inside a recent window, NOT from the
     * `sold_count` column -- nothing has ever written to that column, so
     * ordering by it would produce an arbitrary list wearing the word
     * "trending". Cancelled and returned orders are excluded: a product that
     * six people ordered and then sent back is the opposite of trending.
     *
     * A new shop has no trend yet, so the list is topped up with the newest
     * products rather than rendering a section with two items in it.
     */
    public function trending(Request $request): AnonymousResourceCollection
    {
        $limit = min(max($request->integer('limit', 10), 1), 24);
        $days = min(max($request->integer('days', 30), 1), 365);

        $ranked = DB::table('order_items as oi')
            ->join('orders as o', 'o.id', '=', 'oi.order_id')
            ->join('product_variations as v', 'v.id', '=', 'oi.product_variation_id')
            ->where('o.created_at', '>=', now()->subDays($days))
            ->whereNotIn('o.status', [OrderStatus::Cancelled->value, OrderStatus::Returned->value])
            // Returns are netted off rather than ignored, so a line that was
            // half sent back counts for the half that was kept.
            ->selectRaw('v.product_id, SUM(oi.quantity - oi.quantity_returned) as sold')
            ->groupBy('v.product_id')
            ->havingRaw('SUM(oi.quantity - oi.quantity_returned) > 0')
            ->orderByDesc('sold')
            ->limit($limit)
            ->pluck('sold', 'v.product_id');

        $products = Product::query()
            ->published()
            ->with(['category:id,name,slug', 'brand:id,name,slug', 'primaryImage', 'defaultVariation.inventory'])
            ->withCount('variations')
            ->whereIn('id', $ranked->keys())
            ->get()
            // The database returned the ranking; this restores it, because
            // whereIn() does not preserve the order it was given.
            ->sortByDesc(fn (Product $product) => (float) $ranked[$product->id])
            ->values();

        if ($products->count() < $limit) {
            $filler = Product::query()
                ->published()
                ->with(['category:id,name,slug', 'brand:id,name,slug', 'primaryImage', 'defaultVariation.inventory'])
                ->withCount('variations')
                ->whereNotIn('id', $products->pluck('id'))
                ->latest('id')
                ->limit($limit - $products->count())
                ->get();

            $products = $products->concat($filler);
        }

        return ProductResource::collection($products);
    }
}
