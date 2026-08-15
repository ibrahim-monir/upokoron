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
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class InventoryController extends Controller
{
    public function __construct(private readonly InventoryService $inventory) {}

    /**
     * Every stock-tracked variation, not just ones that have moved.
     *
     * A product just created has no row in `inventories` yet -- nothing has
     * happened to it. Left-joining rather than querying `inventories`
     * directly means it still shows up here, at zero, right after creation:
     * this list is "what should have stock," not "what has ever had stock."
     */
    public function index(Request $request): JsonResponse
    {
        abort_unless($request->user()?->can('inventory.view'), 403);

        $base = DB::table('product_variations as v')
            ->join('products as p', 'p.id', '=', 'v.product_id')
            ->leftJoin('inventories as i', 'i.product_variation_id', '=', 'v.id')
            ->whereNull('v.deleted_at')
            ->where('p.is_stock_tracked', true)
            ->when($request->filled('search'), function ($query) use ($request): void {
                $term = '%'.$request->string('search')->value().'%';

                $query->where(fn ($q) => $q->where('v.sku', 'like', $term)
                    ->orWhere('v.barcode', 'like', $term)
                    ->orWhere('p.name', 'like', $term));
            })
            ->when(
                $request->string('filter')->value() === 'low',
                fn ($q) => $q->where('i.reorder_level', '>', 0)->whereColumn('i.quantity', '<=', 'i.reorder_level'),
            )
            ->when(
                $request->string('filter')->value() === 'out',
                fn ($q) => $q->where(fn ($q2) => $q2->whereNull('i.id')->orWhere('i.available_quantity', '<=', 0)),
            )
            ->when(
                $request->string('filter')->value() === 'in',
                fn ($q) => $q->whereNotNull('i.id')->where('i.available_quantity', '>', 0),
            );

        $rows = $base
            ->orderByRaw('i.last_movement_at is null')
            ->orderByDesc('i.last_movement_at')
            ->orderBy('v.id')
            ->paginate($request->integer('per_page', 25), [
                'i.id as inventory_id', 'v.id as variation_id', 'v.sku', 'v.name as variation_name',
                'v.selling_price', 'p.name as product_name',
                'i.quantity', 'i.reserved_quantity', 'i.available_quantity', 'i.average_cost',
                'i.stock_value', 'i.reorder_level', 'i.last_movement_at',
            ]);

        return response()->json([
            'data' => collect($rows->items())->map(fn (object $row) => [
                'id' => $row->inventory_id,
                'product_variation_id' => $row->variation_id,
                'sku' => $row->sku,
                'product' => $row->product_name,
                'variation' => $row->variation_name,
                'selling_price' => $row->selling_price,
                'quantity' => $row->quantity ?? '0.000',
                'reserved_quantity' => $row->reserved_quantity ?? '0.000',
                'available_quantity' => $row->available_quantity ?? '0.000',
                'average_cost' => $row->average_cost ?? '0.000000',
                'stock_value' => $row->stock_value ?? '0.00',
                'reorder_level' => $row->reorder_level ?? '0.000',
                'is_low' => $row->reorder_level > 0 && (float) $row->quantity <= (float) $row->reorder_level,
                'is_out' => $row->available_quantity === null || (float) $row->available_quantity <= 0,
                'last_movement_at' => $row->last_movement_at !== null
                    ? Carbon::parse($row->last_movement_at)->toIso8601String()
                    : null,
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
        // Matches index()'s left join: a stock-tracked variation with no
        // inventories row yet still counts as tracked, and as out of stock.
        $totals = DB::table('product_variations as v')
            ->join('products as p', 'p.id', '=', 'v.product_id')
            ->leftJoin('inventories as i', 'i.product_variation_id', '=', 'v.id')
            ->whereNull('v.deleted_at')
            ->where('p.is_stock_tracked', true)
            // `lines` is a reserved word in MySQL (LOAD DATA ... LINES
            // TERMINATED BY), so an unquoted alias is a syntax error and this
            // whole summary 500s.
            ->selectRaw('COUNT(*) as tracked_lines')
            ->selectRaw('COALESCE(SUM(i.stock_value), 0) as value')
            ->selectRaw('SUM(CASE WHEN i.id IS NULL OR i.available_quantity <= 0 THEN 1 ELSE 0 END) as out_of_stock')
            ->selectRaw('SUM(CASE WHEN i.reorder_level > 0 AND i.quantity <= i.reorder_level THEN 1 ELSE 0 END) as low_stock')
            ->first();

        return [
            'tracked_items' => (int) $totals->tracked_lines,
            'stock_value' => Money::of((string) $totals->value)->value(),
            'out_of_stock' => (int) $totals->out_of_stock,
            'low_stock' => (int) $totals->low_stock,
        ];
    }
}
