<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\Unit;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class UnitController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        abort_unless($request->user()?->can('products.view'), 403);

        return response()->json(['data' => Unit::withCount('products')->orderBy('name')->get()]);
    }

    public function store(Request $request): JsonResponse
    {
        abort_unless($request->user()?->can('attributes.manage'), 403);

        return response()->json([
            'message' => 'Unit created.',
            'unit' => Unit::create($this->validated($request)),
        ], 201);
    }

    public function update(Request $request, Unit $unit): JsonResponse
    {
        abort_unless($request->user()?->can('attributes.manage'), 403);

        $unit->update($this->validated($request, $unit));

        return response()->json(['message' => 'Unit updated.', 'unit' => $unit->fresh()]);
    }

    public function destroy(Request $request, Unit $unit): JsonResponse
    {
        abort_unless($request->user()?->can('attributes.manage'), 403);

        if ($unit->products()->exists()) {
            return response()->json([
                'message' => "[{$unit->name}] is used by existing products.",
                'code' => 'unit_in_use',
            ], 409);
        }

        $unit->delete();

        return response()->json(['message' => 'Unit deleted.']);
    }

    /**
     * @return array<string, mixed>
     */
    private function validated(Request $request, ?Unit $unit = null): array
    {
        return $request->validate([
            'name' => ['required', 'string', 'max:50', Rule::unique('units', 'name')->ignore($unit)],
            'short_name' => ['required', 'string', 'max:15'],
            // Pieces cannot be sold in halves. Drives quantity validation
            // everywhere stock moves.
            'allow_decimal' => ['sometimes', 'boolean'],
            'is_active' => ['sometimes', 'boolean'],
        ]);
    }
}
