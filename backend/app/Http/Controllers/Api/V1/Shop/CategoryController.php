<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1\Shop;

use App\Http\Controllers\Controller;
use App\Http\Resources\ProductResource;
use App\Models\Category;
use App\Models\Product;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CategoryController extends Controller
{
    /**
     * Categories for the storefront navigation.
     *
     * Only active categories that actually lead somewhere: a category with no
     * published products behind it is a dead end in the menu, so it is
     * counted and the frontend can choose to hide it.
     */
    public function index(Request $request): JsonResponse
    {
        $categories = Category::query()
            ->active()
            ->with(['children' => fn ($q) => $q->active()])
            ->roots()
            ->orderBy('position')
            ->orderBy('name')
            ->get();

        $counts = $this->publishedCounts();

        return response()->json([
            'data' => $categories->map(fn (Category $category) => $this->present($category, $counts)),
        ]);
    }

    /**
     * The home page shows a strip of products per category. Doing that as one
     * request per category would be N+1 over the network; this returns the
     * whole thing in one.
     */
    public function featured(Request $request): JsonResponse
    {
        $perCategory = min(max($request->integer('per_category', 5), 1), 12);
        $limit = min(max($request->integer('limit', 4), 1), 10);

        $categories = Category::query()
            ->active()
            ->orderBy('position')
            ->orderBy('name')
            ->get();

        $sections = [];

        foreach ($categories as $category) {
            if (count($sections) >= $limit) {
                break;
            }

            $products = Product::query()
                ->published()
                ->inCategory($category)
                ->with(['brand:id,name,slug', 'primaryImage', 'defaultVariation'])
                ->latest('id')
                ->limit($perCategory)
                ->get();

            if ($products->isEmpty()) {
                continue;
            }

            $sections[] = [
                'id' => $category->id,
                'name' => $category->name,
                'slug' => $category->slug,
                'products' => ProductResource::collection($products),
            ];
        }

        return response()->json(['data' => $sections]);
    }

    /**
     * @param  array<int, int>  $counts
     * @return array<string, mixed>
     */
    private function present(Category $category, array $counts): array
    {
        return [
            'id' => $category->id,
            'name' => $category->name,
            'slug' => $category->slug,
            'image' => $category->image,
            'icon' => $category->icon,
            'product_count' => $this->countFor($category, $counts),
            'children' => $category->children->map(fn (Category $child) => [
                'id' => $child->id,
                'name' => $child->name,
                'slug' => $child->slug,
                'image' => $child->image,
                'product_count' => $counts[$child->id] ?? 0,
            ]),
        ];
    }

    /**
     * A parent's count includes everything filed beneath it, or "Kitchen"
     * would read as empty while its sub-categories are full.
     *
     * @param  array<int, int>  $counts
     */
    private function countFor(Category $category, array $counts): int
    {
        return $category->descendantIds()->sum(fn (int $id) => $counts[$id] ?? 0);
    }

    /**
     * Published product counts per primary category, in one query.
     *
     * @return array<int, int>
     */
    private function publishedCounts(): array
    {
        return Product::query()
            ->published()
            ->selectRaw('category_id, COUNT(*) as total')
            ->groupBy('category_id')
            ->pluck('total', 'category_id')
            ->map(fn ($total) => (int) $total)
            ->all();
    }
}
