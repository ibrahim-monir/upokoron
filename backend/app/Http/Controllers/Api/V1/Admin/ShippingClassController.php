<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\ShippingClass;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

/**
 * Shipping classes: labels such as "Heavy" or "Fragile" that a product can
 * carry and a delivery option can charge extra for.
 */
class ShippingClassController extends Controller
{
    /**
     * Readable by anyone who edits products too, because the product form
     * offers the list -- managing it still needs shipping.manage.
     */
    public function index(Request $request): JsonResponse
    {
        abort_unless(
            $request->user()?->can('shipping.manage') || $request->user()?->can('products.view'),
            403,
        );

        $classes = ShippingClass::query()->withCount('products')->orderBy('name')->get();

        return response()->json([
            'data' => $classes->map(fn (ShippingClass $class): array => $this->present($class))->all(),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        abort_unless($request->user()?->can('shipping.manage'), 403);

        $data = $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'description' => ['nullable', 'string', 'max:255'],
        ]);

        $class = ShippingClass::create($data + ['slug' => $this->uniqueSlug($data['name'])]);

        return response()->json(['data' => $this->present($class->loadCount('products'))], 201);
    }

    public function update(Request $request, ShippingClass $shippingClass): JsonResponse
    {
        abort_unless($request->user()?->can('shipping.manage'), 403);

        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:120'],
            'description' => ['nullable', 'string', 'max:255'],
        ]);

        $shippingClass->update($data);

        return response()->json(['data' => $this->present($shippingClass->loadCount('products'))]);
    }

    /**
     * Its products become ordinary ones and its extra charges go with it
     * (nullOnDelete and cascadeOnDelete in the migration).
     */
    public function destroy(Request $request, ShippingClass $shippingClass): JsonResponse
    {
        abort_unless($request->user()?->can('shipping.manage'), 403);

        $shippingClass->delete();

        return response()->json(['message' => 'Shipping class removed.']);
    }

    /**
     * @return array<string, mixed>
     */
    private function present(ShippingClass $class): array
    {
        return [
            'id' => $class->id,
            'name' => $class->name,
            'slug' => $class->slug,
            'description' => $class->description,
            'products_count' => (int) ($class->products_count ?? 0),
        ];
    }

    private function uniqueSlug(string $name): string
    {
        $base = Str::slug($name) ?: 'class';
        $slug = $base;
        $n = 2;

        while (ShippingClass::where('slug', $slug)->exists()) {
            $slug = "{$base}-{$n}";
            $n++;
        }

        return $slug;
    }
}
