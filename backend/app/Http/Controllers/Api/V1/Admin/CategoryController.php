<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Http\Resources\CategoryResource;
use App\Models\Category;
use App\Services\Catalog\CategoryService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Validation\Rule;

class CategoryController extends Controller
{
    public function __construct(private readonly CategoryService $categories) {}

    public function index(Request $request): AnonymousResourceCollection|JsonResponse
    {
        abort_unless($request->user()?->can('products.view'), 403);

        if ($request->boolean('tree')) {
            return response()->json([
                'data' => CategoryResource::collection(
                    $this->categories->tree($request->boolean('active_only'))
                ),
            ]);
        }

        $categories = Category::query()
            ->with('parent:id,name')
            ->withCount('products')
            ->when($request->filled('search'), fn ($q) => $q->where('name', 'like', '%'.$request->string('search')->value().'%'))
            ->when($request->boolean('roots_only'), fn ($q) => $q->roots())
            ->when($request->boolean('active_only'), fn ($q) => $q->active())
            ->orderBy('depth')
            ->orderBy('position')
            ->orderBy('name')
            ->get();

        return CategoryResource::collection($categories);
    }

    public function store(Request $request): JsonResponse
    {
        abort_unless($request->user()?->can('categories.manage'), 403);

        $category = $this->categories->create($this->validated($request));

        return response()->json([
            'message' => 'Category created.',
            'category' => new CategoryResource($category),
        ], 201);
    }

    public function show(Request $request, Category $category): CategoryResource
    {
        abort_unless($request->user()?->can('products.view'), 403);

        return new CategoryResource($category->load('parent', 'children')->loadCount('products'));
    }

    public function update(Request $request, Category $category): JsonResponse
    {
        abort_unless($request->user()?->can('categories.manage'), 403);

        $updated = $this->categories->update($category, $this->validated($request, $category));

        return response()->json([
            'message' => 'Category updated.',
            'category' => new CategoryResource($updated),
        ]);
    }

    public function destroy(Request $request, Category $category): JsonResponse
    {
        abort_unless($request->user()?->can('categories.manage'), 403);

        $this->categories->delete($category);

        return response()->json(['message' => 'Category deleted.']);
    }

    /**
     * @return array<string, mixed>
     */
    private function validated(Request $request, ?Category $category = null): array
    {
        return $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'slug' => ['nullable', 'string', 'max:140', Rule::unique('categories', 'slug')->ignore($category)],
            'parent_id' => ['nullable', Rule::exists('categories', 'id')->whereNull('deleted_at')],
            'description' => ['nullable', 'string', 'max:2000'],
            'image' => ['nullable', 'string', 'max:255'],
            'icon' => ['nullable', 'string', 'max:60'],
            'position' => ['sometimes', 'integer', 'min:0', 'max:65535'],
            'is_active' => ['sometimes', 'boolean'],
            'is_featured' => ['sometimes', 'boolean'],
            'meta_title' => ['nullable', 'string', 'max:160'],
            'meta_description' => ['nullable', 'string', 'max:320'],
        ]);
    }
}
