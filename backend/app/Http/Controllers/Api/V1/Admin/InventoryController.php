<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1\Admin;

use App\Enums\InventoryDirection;
use App\Enums\InventoryTransactionType;
use App\Http\Controllers\Controller;
use App\Models\Inventory;
use App\Models\InventoryTransaction;
use App\Models\ProductVariation;
use App\Services\Inventory\InventoryService;
use App\Support\Money;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class InventoryController extends Controller
{
    public function __construct(private readonly InventoryService $inventory) {}

    /**
     * Stock levels across the catalogue.
     */
    public function index(Request $request): JsonResponse
    {
        abort_unless($request->user()?->can('inventory.view'), 403);

        $rows = Inventory::query()
            ->with(['variation:id,product_id,sku,name,selling_price', 'variation.product:id,name,slug'])
            ->when($request->filled('search'), function ($query) use ($request): void {
                $term = '%'.$request->string('search')->value().'%';

                $query->whereHas('variation', fn ($v) => $v->where('sku', 'like', $term)
                    ->orWhere('barcode', 'like', $term)
                    ->orWhereHas('product', fn ($p) => $p->where('name', 'like', $term)));
            })
            ->when($request->string('filter')->value() === 'low', fn ($q) => $q->lowStock())
            ->when($request->string('filter')->value() === 'out', fn ($q) => $q->outOfStock())
            ->when($request->string('filter')->value() === 'in', fn ($q) => $q->inStock())
            ->orderByDesc('last_movement_at')
            ->orderBy('id')
            ->paginate($request->integer('per_page', 25));

        return response()->json([
            'data' => collect($rows->items())->map(fn (Inventory $row) => [
                'id' => $row->id,
                'product_variation_id' => $row->product_variation_id,
                'sku' => $row->variation?->sku,
                'product' => $row->variation?->product?->name,
                'variation' => $row->variation?->name,
                'selling_price' => $row->variation?->selling_price,
                'quantity' => $row->quantity,
                'reserved_quantity' => $row->reserved_quantity,
                'available_quantity' => $row->available_quantity,
                'average_cost' => $row->average_cost,
                'stock_value' => $row->stock_value,
                'reorder_level' => $row->reorder_level,
                'is_low' => $row->isBelowReorderLevel(),
                'is_out' => $row->isOutOfStock(),
                'last_movement_at' => $row->last_movement_at?->toIso8601String(),
            ]),
            'meta' => [
                'current_page' => $rows->currentPage(),
                'last_page' => $rows->lastPage(),
                'per_page' => $rows->perPage(),
                'total' => $rows->total(),
            ],
            'summary' => $this->summary(),
        ]);
    }

    /**
     * Movement history for one variation, newest first.
     */
    public function movements(Request $request, ProductVariation $variation): JsonResponse
    {
        abort_unless($request->user()?->can('inventory.view'), 403);

        $movements = InventoryTransaction::query()
            ->where('product_variation_id', $variation->id)
            ->with('journalEntry:id,number')
            ->between($request->input('from'), $request->input('to'))
            ->orderByDesc('transacted_at')
            ->orderByDesc('id')
            ->paginate($request->integer('per_page', 30));

        return response()->json([
            'variation' => [
                'id' => $variation->id,
                'sku' => $variation->sku,
                'name' => $variation->name,
            ],
            'data' => collect($movements->items())->map(fn (InventoryTransaction $t) => [
                'id' => $t->id,
                'type' => $t->type->value,
                'type_label' => $t->type->label(),
                'direction' => $t->direction->value,
                'quantity' => $t->quantity,
                'unit_cost' => $t->unit_cost,
                'total_cost' => $t->total_cost,
                'quantity_after' => $t->quantity_after,
                'value_after' => $t->value_after,
                'average_cost_after' => $t->average_cost_after,
                'journal_entry' => $t->journalEntry?->number,
                'note' => $t->note,
                'transacted_at' => $t->transacted_at?->toIso8601String(),
            ]),
            'meta' => [
                'current_page' => $movements->currentPage(),
                'last_page' => $movements->lastPage(),
                'total' => $movements->total(),
            ],
        ]);
    }

    /**
     * Manual adjustment: damage, loss, a recount, or opening stock.
     *
     * Every one of these writes a stock movement AND a journal entry, so
     * value never disappears without landing somewhere in the P&L.
     */
    public function adjust(Request $request): JsonResponse
    {
        abort_unless($request->user()?->can('inventory.adjust'), 403);

        $validated = $request->validate([
            'product_variation_id' => ['required', Rule::exists('product_variations', 'id')->whereNull('deleted_at')],
            'quantity' => ['required', 'numeric', 'gt:0'],
            'type' => ['required', Rule::in(['adjustment', 'damage', 'lost', 'found', 'opening'])],
            'direction' => ['required_unless:type,opening', Rule::in(['in', 'out'])],
            'unit_cost' => ['nullable', 'numeric', 'min:0'],
            'note' => ['nullable', 'string', 'max:500'],
            'date' => ['nullable', 'date'],
        ]);

        $variation = ProductVariation::findOrFail($validated['product_variation_id']);
        $type = InventoryTransactionType::from($validated['type']);

        if ($type === InventoryTransactionType::Opening) {
            abort_unless($request->user()->can('inventory.opening'), 403, 'You cannot enter opening stock.');

            $unitCost = Money::of($validated['unit_cost'] ?? '0');

            $movement = $this->inventory->openingStock(
                $variation,
                (string) $validated['quantity'],
                $unitCost->times((string) $validated['quantity']),
                $validated['note'] ?? null,
                $validated['date'] ?? null,
            );
        } else {
            $movement = $this->inventory->adjust(
                $variation,
                (string) $validated['quantity'],
                InventoryDirection::from($validated['direction']),
                $type,
                unitCost: $validated['unit_cost'] ?? null,
                note: $validated['note'] ?? null,
                date: $validated['date'] ?? null,
            );
        }

        return response()->json([
            'message' => sprintf(
                '%s recorded: %s x %s. Stock is now %s.',
                $type->label(),
                rtrim(rtrim($movement->quantity, '0'), '.'),
                $variation->sku,
                rtrim(rtrim($movement->quantity_after, '0'), '.'),
            ),
            'movement' => [
                'id' => $movement->id,
                'quantity_after' => $movement->quantity_after,
                'value_after' => $movement->value_after,
                'average_cost_after' => $movement->average_cost_after,
                'total_cost' => $movement->total_cost,
            ],
        ], 201);
    }

    /**
     * Set reorder thresholds. These do not move stock, so they do not touch
     * the ledger.
     */
    public function updateLevels(Request $request, ProductVariation $variation): JsonResponse
    {
        abort_unless($request->user()?->can('inventory.adjust'), 403);

        $validated = $request->validate([
            'min_stock' => ['nullable', 'numeric', 'min:0'],
            'reorder_level' => ['nullable', 'numeric', 'min:0'],
            'max_stock' => ['nullable', 'numeric', 'min:0'],
        ]);

        $inventory = $this->inventory->inventoryFor($variation);

        $inventory->forceFill(array_filter($validated, fn ($v) => $v !== null))->save();

        return response()->json(['message' => 'Stock levels updated.']);
    }

    /**
     * What the stock on hand is worth. Reconciles against account 1150.
     */
    public function valuation(Request $request): JsonResponse
    {
        abort_unless(
            $request->user()?->can('inventory.valuation') || $request->user()?->can('reports.inventory'),
            403,
        );

        $rows = Inventory::query()
            ->with(['variation:id,product_id,sku,name', 'variation.product:id,name'])
            ->where('quantity', '>', 0)
            ->orderByDesc('stock_value')
            ->get();

        $total = $rows->reduce(fn (Money $carry, Inventory $row) => $carry->plus($row->stock_value), Money::zero());

        return response()->json([
            'as_of' => now(config('upokoron.display_timezone'))->toDateString(),
            'total_value' => $total->value(),
            'line_count' => $rows->count(),
            'data' => $rows->map(fn (Inventory $row) => [
                'sku' => $row->variation?->sku,
                'product' => $row->variation?->product?->name,
                'variation' => $row->variation?->name,
                'quantity' => $row->quantity,
                'average_cost' => $row->average_cost,
                'stock_value' => $row->stock_value,
            ]),
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    private function summary(): array
    {
        $totals = DB::table('inventories')
            ->selectRaw('COUNT(*) as lines')
            ->selectRaw('COALESCE(SUM(stock_value), 0) as value')
            ->selectRaw('SUM(CASE WHEN available_quantity <= 0 THEN 1 ELSE 0 END) as out_of_stock')
            ->selectRaw('SUM(CASE WHEN reorder_level > 0 AND quantity <= reorder_level THEN 1 ELSE 0 END) as low_stock')
            ->first();

        return [
            'tracked_items' => (int) $totals->lines,
            'stock_value' => Money::of((string) $totals->value)->value(),
            'out_of_stock' => (int) $totals->out_of_stock,
            'low_stock' => (int) $totals->low_stock,
        ];
    }
}
