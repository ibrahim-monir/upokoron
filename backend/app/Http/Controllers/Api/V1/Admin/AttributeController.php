<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\Attribute;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class AttributeController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        abort_unless($request->user()?->can('products.view'), 403);

        $attributes = Attribute::with('values')
            ->when($request->boolean('variant_only'), fn ($q) => $q->variant())
            ->orderBy('position')
            ->orderBy('name')
            ->get();

        return response()->json(['data' => $attributes]);
    }

    public function store(Request $request): JsonResponse
    {
        abort_unless($request->user()?->can('attributes.manage'), 403);

        $validated = $this->validated($request);

        $attribute = DB::transaction(function () use ($validated): Attribute {
            // `values` is a nested collection, not a column. Passing it to
            // create() throws under strict models.
            $attribute = Attribute::create(Arr::except($validated, ['values']));
            $this->syncValues($attribute, $validated['values'] ?? []);

            return $attribute;
        });

        return response()->json([
            'message' => 'Attribute created.',
            'attribute' => $attribute->load('values'),
        ], 201);
    }

    public function show(Request $request, Attribute $attribute): JsonResponse
    {
        abort_unless($request->user()?->can('products.view'), 403);

        return response()->json(['data' => $attribute->load('values')]);
    }

    public function update(Request $request, Attribute $attribute): JsonResponse
    {
        abort_unless($request->user()?->can('attributes.manage'), 403);

        $validated = $this->validated($request, $attribute);

        DB::transaction(function () use ($attribute, $validated): void {
            $attribute->update(Arr::except($validated, ['values']));

            if (array_key_exists('values', $validated)) {
                $this->syncValues($attribute, $validated['values']);
            }
        });

        return response()->json([
            'message' => 'Attribute updated.',
            'attribute' => $attribute->fresh()->load('values'),
        ]);
    }

    public function destroy(Request $request, Attribute $attribute): JsonResponse
    {
        abort_unless($request->user()?->can('attributes.manage'), 403);

        // product_variation_values restricts on delete, so an attribute in use
        // would fail at the database with an unreadable error. Catch it here.
        $inUse = DB::table('product_variation_values')
            ->where('attribute_id', $attribute->id)
            ->exists();

        if ($inUse) {
            return response()->json([
                'message' => "[{$attribute->name}] is used by existing product variations and cannot be deleted.",
                'code' => 'attribute_in_use',
            ], 409);
        }

        $attribute->delete();

        return response()->json(['message' => 'Attribute deleted.']);
    }

    /**
     * Values are replaced wholesale, but one already used by a variation is
     * kept: deleting it would cascade away the variation's identity and leave
     * a SKU nobody can describe.
     *
     * @param  array<int, array<string, mixed>>  $values
     */
    private function syncValues(Attribute $attribute, array $values): void
    {
        $keptIds = [];

        foreach (array_values($values) as $position => $value) {
            $attributes = [
                'value' => $value['value'],
                'color_hex' => $value['color_hex'] ?? null,
                'position' => $position,
            ];

            /*
             * Deliberately NOT updateOrCreate keyed on `id`: the match array
             * is merged into the attributes used to create, so a null id ends
             * up being mass-assigned and Eloquent rejects it. Branching keeps
             * the primary key out of the write entirely.
             */
            $existing = isset($value['id'])
                ? $attribute->values()->whereKey($value['id'])->first()
                : null;

            if ($existing !== null) {
                $existing->update($attributes);
                $keptIds[] = $existing->id;

                continue;
            }

            $keptIds[] = $attribute->values()->create($attributes)->id;
        }

        $removed = $attribute->values()->whereNotIn('id', $keptIds)->get();

        foreach ($removed as $value) {
            $inUse = DB::table('product_variation_values')
                ->where('attribute_value_id', $value->id)
                ->exists();

            if (! $inUse) {
                $value->delete();
            }
        }
    }

    /**
     * @return array<string, mixed>
     */
    private function validated(Request $request, ?Attribute $attribute = null): array
    {
        return $request->validate([
            'name' => ['required', 'string', 'max:60'],
            'slug' => ['nullable', 'string', 'max:70', Rule::unique('attributes', 'slug')->ignore($attribute)],
            'type' => ['required', Rule::in(['select', 'color', 'text'])],
            'is_variant' => ['sometimes', 'boolean'],
            'is_filterable' => ['sometimes', 'boolean'],
            'position' => ['sometimes', 'integer', 'min:0', 'max:65535'],
            'is_active' => ['sometimes', 'boolean'],

            'values' => ['sometimes', 'array'],
            'values.*.id' => ['nullable', 'integer', Rule::exists('attribute_values', 'id')],
            'values.*.value' => ['required', 'string', 'max:80'],
            'values.*.color_hex' => ['nullable', 'string', 'regex:/^#[0-9a-fA-F]{6}$/'],
        ]);
    }
}
