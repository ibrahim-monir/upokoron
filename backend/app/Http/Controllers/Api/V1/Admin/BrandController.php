<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\Brand;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class BrandController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        abort_unless($request->user()?->can('products.view'), 403);

        $brands = Brand::withCount('products')
            ->when($request->filled('search'), fn ($q) => $q->where('name', 'like', '%'.$request->string('search')->value().'%'))
            ->when($request->boolean('active_only'), fn ($q) => $q->active())
            ->orderBy('position')
            ->orderBy('name')
            ->get();

        return response()->json(['data' => $brands]);
    }

    public function store(Request $request): JsonResponse
    {
        abort_unless($request->user()?->can('brands.manage'), 403);

        $brand = Brand::create($this->validated($request));

        return response()->json(['message' => 'Brand created.', 'brand' => $brand], 201);
    }

    public function show(Request $request, Brand $brand): JsonResponse
    {
        abort_unless($request->user()?->can('products.view'), 403);

        return response()->json(['data' => $brand->loadCount('products')]);
    }

    public function update(Request $request, Brand $brand): JsonResponse
    {
        abort_unless($request->user()?->can('brands.manage'), 403);

        $brand->update($this->validated($request, $brand));

        return response()->json(['message' => 'Brand updated.', 'brand' => $brand->fresh()]);
    }

    public function destroy(Request $request, Brand $brand): JsonResponse
    {
        abort_unless($request->user()?->can('brands.manage'), 403);

        $count = $brand->products()->count();

        if ($count > 0) {
            // brand_id is nullOnDelete, so deleting would silently strip the
            // brand from live products. Make it a deliberate choice instead.
            return response()->json([
                'message' => "[{$brand->name}] still has {$count} product(s). ".
                    'Move them to another brand, or deactivate this one instead.',
                'code' => 'brand_has_products',
            ], 409);
        }

        $brand->delete();

        return response()->json(['message' => 'Brand deleted.']);
    }

    /**
     * @return array<string, mixed>
     */
    private function validated(Request $request, ?Brand $brand = null): array
    {
        return $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'slug' => ['nullable', 'string', 'max:140', Rule::unique('brands', 'slug')->ignore($brand)],
            'logo' => ['nullable', 'string', 'max:255'],
            'description' => ['nullable', 'string', 'max:2000'],
            'position' => ['sometimes', 'integer', 'min:0', 'max:65535'],
            'is_active' => ['sometimes', 'boolean'],
            'is_featured' => ['sometimes', 'boolean'],
            'meta_title' => ['nullable', 'string', 'max:160'],
            'meta_description' => ['nullable', 'string', 'max:320'],
        ]);
    }
}
