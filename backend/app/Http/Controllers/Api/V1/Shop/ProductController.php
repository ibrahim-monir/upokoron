<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1\Shop;

use App\Enums\OrderStatus;
use App\Enums\ProductStatus;
use App\Http\Controllers\Controller;
use App\Http\Resources\ProductResource;
use App\Models\Category;
use App\Models\Product;
use App\Models\ProductVariation;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\DB;

class ProductController extends Controller
{
    /**
     * Public storefront product listing.
     */
    /**
     * What the sidebar filters can offer for this category or search.
     *
     * Scoped by category and search only, deliberately not by the filters
     * themselves. Recomputing the options from the already-filtered results
     * makes every choice you make remove the others, so undoing it is the
     * only way to see what else there was -- the filters end up fighting the
     * person using them.
     */
    public function filters(Request $request): JsonResponse
    {
        $base = fn () => Product::query()
            ->published()
            ->when($request->filled('search'), function ($query) use ($request): void {
                $term = '%'.$request->string('search')->trim().'%';
                $query->where('name', 'like', $term);
            })
            ->when($request->filled('category'), function ($query) use ($request): void {
                $category = Category::query()->where('slug', $request->string('category')->trim())->first();

                $category !== null ? $query->inCategory($category) : $query->whereRaw('1 = 0');
            });

        $prices = ProductVariation::query()
            ->where('is_default', true)
            ->whereIn('product_id', (clone $base())->select('products.id'))
            ->selectRaw('MIN(selling_price) as low, MAX(selling_price) as high')
            ->first();

        // One count per "and up" step. A step nothing reaches is dropped by
        // the frontend rather than offered as a choice that returns nothing.
        $ratings = [];

        foreach ([4, 3, 2, 1] as $floor) {
            $ratings[] = [
                'value' => $floor,
                'product_count' => (clone $base())
                    ->where('rating_count', '>', 0)
                    ->where('rating_avg', '>=', $floor)
                    ->count(),
            ];
        }

        return response()->json([
            'data' => [
                // Null when there is nothing to price, so the frontend can
                // leave the block out rather than draw an empty range.
                'price' => $prices?->low === null ? null : [
                    'min' => (int) floor((float) $prices->low),
                    'max' => (int) ceil((float) $prices->high),
                ],

                'ratings' => $ratings,
            ],
        ]);
    }

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

            // Price range, read off the variation the listing actually shows
            // a price for. Filtering on any variation would put a product in
            // a "under 500" list because one size of it is cheap while the
            // card beside it says 2,400.
            ->when($request->filled('min_price'), function ($query) use ($request): void {
                $min = $request->string('min_price')->value();
                $query->whereHas('defaultVariation', fn ($v) => $v->where('selling_price', '>=', $min));
            })
            ->when($request->filled('max_price'), function ($query) use ($request): void {
                $max = $request->string('max_price')->value();
                $query->whereHas('defaultVariation', fn ($v) => $v->where('selling_price', '<=', $max));
            })

            // Rating, as a floor rather than an exact number: nobody looks
            // for "exactly three stars". A product nobody has reviewed has a
            // rating of 0 and is excluded by any floor, which is the honest
            // answer -- unrated is not the same as badly rated, but it is
            // certainly not "4 stars and up".
            ->when($request->filled('min_rating'), function ($query) use ($request): void {
                $query->where('rating_avg', '>=', (float) $request->input('min_rating'))
                    ->where('rating_count', '>', 0);
            })

            // The default variation's price, for sorting. A subquery rather
            // than a join: a product with no default variation still belongs
            // in the list, it just sorts as having no price.
            ->addSelect(['list_price' => ProductVariation::query()
                ->select('selling_price')
                ->whereColumn('product_id', 'products.id')
                ->where('is_default', true)
                ->limit(1),
            ])

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
            ->when(
                $request->string('sort')->value() === 'price',
                fn ($query) => $query->orderBy('list_price')
            )
            ->when(
                $request->string('sort')->value() === 'price_desc',
                fn ($query) => $query->orderByDesc('list_price')
            )

            // Default: newest products first.
            ->when(
                ! in_array(
                    $request->string('sort')->value(),
                    ['oldest', 'name', 'name_desc', 'price', 'price_desc'],
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

    /**
     * Accessories for the product being viewed.
     *
     * NOT more of the same category -- that is what "related" already does,
     * and it offers a shopper looking at a battery another battery. These
     * are the products the owner picked as going with this one.
     *
     * Empty when nothing is paired, so the storefront simply shows no
     * section rather than falling back to something that misses the point.
     */
    public function goesWith(Request $request, Product $product): AnonymousResourceCollection
    {
        abort_unless(
            $product->status === ProductStatus::Active
            && ($product->published_at === null || $product->published_at->lte(now())),
            404,
        );

        $limit = min(max($request->integer('limit', 10), 1), 24);

        $products = $product->pairedProducts()
            ->published()
            ->with(['category:id,name,slug', 'brand:id,name,slug', 'primaryImage', 'defaultVariation.inventory'])
            ->withCount('variations')
            // A paired product that was later withdrawn or unpublished drops
            // out on its own; nobody has to remember to unpick it.
            ->limit($limit)
            ->get();

        return ProductResource::collection($products);
    }
}
