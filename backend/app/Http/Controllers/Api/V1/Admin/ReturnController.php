<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1\Admin;

use App\Enums\ReturnStatus;
use App\Http\Controllers\Controller;
use App\Models\OrderReturn;
use App\Models\OrderReturnItem;
use App\Services\Order\ReturnService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * The returns desk: requests come in from customers, and are approved,
 * received back onto the shelf, and refunded here.
 */
class ReturnController extends Controller
{
    public function __construct(private readonly ReturnService $returns) {}

    public function index(Request $request): JsonResponse
    {
        abort_unless($request->user()?->can('returns.view'), 403);

        $page = OrderReturn::query()
            ->with(['order:id,number,ship_name,ship_phone', 'items'])
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->string('status')))
            ->latest('id')
            ->paginate($request->integer('per_page', 25));

        return response()->json([
            'data' => collect($page->items())->map(fn (OrderReturn $r): array => $this->present($r))->all(),
            'meta' => [
                'current_page' => $page->currentPage(),
                'last_page' => $page->lastPage(),
                'total' => $page->total(),
            ],
            'counts' => OrderReturn::query()
                ->selectRaw('status, COUNT(*) as n')
                ->groupBy('status')
                ->pluck('n', 'status'),
            'reasons' => OrderReturn::REASONS,
        ]);
    }

    public function show(Request $request, OrderReturn $return): JsonResponse
    {
        abort_unless($request->user()?->can('returns.view'), 403);

        return response()->json(['data' => $this->present($return->load(['order', 'items.orderItem', 'handler:id,name']), detailed: true)]);
    }

    public function approve(Request $request, OrderReturn $return): JsonResponse
    {
        abort_unless($request->user()?->can('returns.manage'), 403);

        $note = $request->validate(['note' => ['nullable', 'string', 'max:500']])['note'] ?? null;

        $this->returns->approve($return, $request->user(), $note);

        return response()->json(['message' => "Return {$return->number} approved. Receive it when the goods arrive."]);
    }

    public function reject(Request $request, OrderReturn $return): JsonResponse
    {
        abort_unless($request->user()?->can('returns.manage'), 403);

        $note = $request->validate(['note' => ['nullable', 'string', 'max:500']])['note'] ?? null;

        $this->returns->reject($return, $request->user(), $note);

        return response()->json(['message' => "Return {$return->number} rejected."]);
    }

    public function receive(Request $request, OrderReturn $return): JsonResponse
    {
        abort_unless($request->user()?->can('returns.manage'), 403);

        $data = $request->validate([
            'items' => ['sometimes', 'array'],
            'items.*.id' => ['required', 'integer'],
            'items.*.restock' => ['required', 'boolean'],
            'note' => ['nullable', 'string', 'max:500'],
        ]);

        $restock = collect($data['items'] ?? [])->mapWithKeys(fn (array $row): array => [(int) $row['id'] => (bool) $row['restock']])->all();

        $return = $this->returns->receive($return, $restock, $request->user(), $data['note'] ?? null);

        return response()->json([
            'message' => "Return {$return->number} received. Refund due: ৳{$return->refund_amount}.",
        ]);
    }

    public function refund(Request $request, OrderReturn $return): JsonResponse
    {
        abort_unless($request->user()?->can('returns.refund'), 403);

        $data = $request->validate([
            'amount' => ['nullable', 'numeric', 'min:0.01', 'max:99999999'],
        ]);

        $return = $this->returns->refund($return->load('order'), $request->user(), isset($data['amount']) ? (string) $data['amount'] : null);

        return response()->json(['message' => "Return {$return->number} refunded."]);
    }

    /**
     * @return array<string, mixed>
     */
    private function present(OrderReturn $return, bool $detailed = false): array
    {
        return [
            'id' => $return->id,
            'number' => $return->number,
            'status' => $return->status->value,
            'status_label' => $return->status->label(),
            'reason' => $return->reason,
            'reason_label' => OrderReturn::REASONS[$return->reason] ?? $return->reason,
            'customer_note' => $return->customer_note,
            'staff_note' => $return->staff_note,
            'refund_amount' => $return->refund_amount,
            'order' => [
                'id' => $return->order?->id,
                'number' => $return->order?->number,
                'customer' => $return->order?->ship_name,
                'phone' => $return->order?->ship_phone,
            ],
            'item_count' => $return->items->count(),
            'requested_at' => $return->requested_at?->toIso8601String(),
            'approved_at' => $return->approved_at?->toIso8601String(),
            'received_at' => $return->received_at?->toIso8601String(),
            'refunded_at' => $return->refunded_at?->toIso8601String(),
            'rejected_at' => $return->rejected_at?->toIso8601String(),
            'handled_by' => $detailed ? $return->handler?->name : null,
            'items' => $detailed ? $return->items->map(fn (OrderReturnItem $row): array => [
                'id' => $row->id,
                'product_name' => $row->orderItem?->product_name,
                'variation_name' => $row->orderItem?->variation_name,
                'sku' => $row->orderItem?->sku,
                'quantity' => $row->quantity,
                'unit_price' => $row->orderItem?->unit_price,
                'restock' => $row->restock,
            ])->all() : [],
        ];
    }
}
