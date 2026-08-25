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
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class ProductController extends Controller
{
    public function __construct(private readonly ProductService $products) {}

    public function index(Request $request): AnonymousResourceCollection
    {
        /*
         * Either permission opens the list, because the list is now the only
         * place stock is managed from. An accountant holds `inventory.view`
         * and never `products.view`, and used to reach stock through a screen
         * of its own; folding that screen in here would otherwise have taken
         * their stock levels away with it.
         *
         * Not a widening of what they can see: the valuation report they
         * already hold lists every product with its quantity, cost and value.
         */
        abort_unless(
            $request->user()?->can('products.view') || $request->user()?->can('inventory.view'),
            403,
        );

        $products = Product::query()
            // `slug` is in the select because ProductResource renders it. A
            // partial select that omits a column the resource reads is an
            // extra query per row in production, and a hard failure under the
            // strict models this project runs in dev and test.
            ->with(['category:id,name,slug', 'brand:id,name,slug', 'primaryImage', 'defaultVariation'])
            ->withCount('variations')
            /*
             * Stock travels with the catalogue row.
             *
             * Products and stock used to be two screens: you looked up what
             * you sell in one and what is on the shelf in another, and kept
             * the join in your head. These aggregates are what let the one
             * table answer both, and they cost three subqueries on a page of
             * twenty rather than a second paginated request.
             *
             * Summed over variations, so a variable product reports the whole
             * product's position; the per-SKU breakdown is a drill-down.
             */
            ->withSum('inventories as stock_on_hand', 'quantity')
            ->withSum('inventories as stock_available', 'available_quantity')
            ->withSum('inventories as stock_value', 'stock_value')
            // "Low" cannot be summed -- it is a per-SKU comparison against
            // that SKU's own reorder level, so one variation under its line
            // makes the product worth looking at.
            ->withExists(['inventories as has_low_stock' => fn ($i) => $i
                ->where('inventories.reorder_level', '>', 0)
                ->whereColumn('inventories.quantity', '<=', 'inventories.reorder_level')])
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
            ->when($request->filled('stock'), fn ($q) => $this->filterByStock($q, $request->string('stock')->value()))
            ->latest('id')
            ->paginate($request->integer('per_page', 20));

        return ProductResource::collection($products);
    }

    /**
     * Narrow the list by what is actually on the shelf.
     *
     * Measured on AVAILABLE quantity, not on hand: stock sitting in someone
     * else's basket cannot be sold to anybody else, so a product with ten
     * units all reserved is out of stock for every purpose this filter
     * serves.
     *
     * Untracked products are never "out": a service or a made-to-order item
     * has no stock row and would otherwise fill the out-of-stock list with
     * things that can always be sold.
     */
    private function filterByStock(Builder $query, string $filter): void
    {
        $hasStock = fn ($q) => $q->whereHas(
            'variations.inventory',
            fn ($i) => $i->where('available_quantity', '>', 0),
        );

        match ($filter) {
            'in' => $hasStock($query),

            'out' => $query->where('is_stock_tracked', true)
                ->whereDoesntHave(
                    'variations.inventory',
                    fn ($i) => $i->where('available_quantity', '>', 0),
                ),

            // At or below the reorder level while still having something
            // left -- the window in which reordering is still useful.
            'low' => $query->where('is_stock_tracked', true)
                ->whereHas('variations.inventory', fn ($i) => $i
                    ->where('reorder_level', '>', 0)
                    ->whereColumn('quantity', '<=', 'reorder_level')
                    ->where('available_quantity', '>', 0)),

            default => null,
        };
    }

    /**
     * Act on several products at once.
     *
     * Publishing forty products one at a time is the kind of task that makes
     * people keep a spreadsheet instead. Each action is checked against its
     * own permission -- changing a status is not the same trust as deleting.
     */
    public function bulk(Request $request): JsonResponse
    {
        $data = $request->validate([
            'action' => ['required', Rule::in(['status', 'feature', 'unfeature', 'delete'])],
            'ids' => ['required', 'array', 'min:1', 'max:200'],
            'ids.*' => ['integer'],
            'status' => ['required_if:action,status', Rule::in(ProductStatus::values())],
        ]);

        $permission = $data['action'] === 'delete' ? 'products.delete' : 'products.update';

        abort_unless($request->user()?->can($permission), 403);

        $products = Product::whereIn('id', $data['ids'])->get();

        $affected = DB::transaction(function () use ($products, $data): int {
            $count = 0;

            foreach ($products as $product) {
                match ($data['action']) {
                    'status' => $product->update(['status' => $data['status']]),
                    'feature' => $product->update(['is_featured' => true]),
                    'unfeature' => $product->update(['is_featured' => false]),

                    // Soft delete. A product that has been sold is referenced
                    // by order lines that must keep reading correctly, so it
                    // is withdrawn rather than removed.
                    'delete' => $product->delete(),
                };

                $count++;
            }

            return $count;
        });

        return response()->json([
            'message' => match ($data['action']) {
                'status' => "{$affected} product(s) set to ".ProductStatus::from($data['status'])->label().'.',
                'feature' => "{$affected} product(s) featured.",
                'unfeature' => "{$affected} product(s) no longer featured.",
                'delete' => "{$affected} product(s) removed.",
            },
            'affected' => $affected,
        ]);
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
            // The edit form shows the on-hand figure and edits it as a real
            // stock movement, so it needs the current level to diff against.
            'variations.inventory',
            'attributeValues.attribute',
            // The accessory picker on the form needs to know what is already
            // chosen.
            'pairedProducts:id',
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
