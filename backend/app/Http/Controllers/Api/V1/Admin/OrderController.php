<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1\Admin;

use App\Enums\OrderStatus;
use App\Http\Controllers\Controller;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\PaymentMethod;
use App\Services\Order\OrderStatusService;
use App\Services\Order\PaymentService;
use App\Support\Money;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * The back office view of orders.
 *
 * Unlike the storefront resource, this one shows cost and margin -- that is
 * the whole reason the shop looks at an order list. It is gated on
 * `orders.view`, and the figures come from what was frozen on the order, not
 * from today's cost price.
 */
class OrderController extends Controller
{
    public function __construct(
        private readonly OrderStatusService $statuses,
        private readonly PaymentService $payments,
    ) {}

    public function index(Request $request): JsonResponse
    {
        abort_unless($request->user()?->can('orders.view'), 403);

        $orders = Order::query()
            ->with(['customer:id,name,phone', 'paymentMethod:id,name,code'])
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->string('status')))
            ->when($request->filled('payment_status'), fn ($q) => $q->where('payment_status', $request->string('payment_status')))
            ->when($request->string('filter')->value() === 'open', fn ($q) => $q->open())
            ->when($request->filled('search'), function ($query) use ($request): void {
                $term = '%'.$request->string('search')->trim().'%';

                $query->where(fn ($q) => $q->where('number', 'like', $term)
                    ->orWhere('ship_phone', 'like', $term)
                    ->orWhere('ship_name', 'like', $term));
            })
            ->when($request->filled('from'), fn ($q) => $q->whereDate('placed_at', '>=', $request->date('from')))
            ->when($request->filled('to'), fn ($q) => $q->whereDate('placed_at', '<=', $request->date('to')))
            ->latest('id')
            ->paginate($request->integer('per_page', 25));

        return response()->json([
            'data' => collect($orders->items())->map(fn (Order $order): array => [
                'id' => $order->id,
                'number' => $order->number,
                'status' => $order->status->value,
                'status_label' => $order->status->label(),
                'payment_status' => $order->payment_status->value,
                'customer' => $order->customer?->name ?? $order->ship_name,
                'phone' => $order->ship_phone,
                'district' => $order->ship_district,
                'payment_method' => $order->paymentMethod?->name,
                'total' => $order->total,
                'paid_total' => $order->paid_total,
                'due_total' => $order->dueAmount()->value(),

                // Only meaningful once the goods have shipped and the cost is
                // frozen; null before that, rather than a misleading zero.
                'cost_total' => $order->status->hasShipped() ? $order->cost_total : null,
                'gross_profit' => $order->status->hasShipped() ? $order->grossProfit()->value() : null,

                'placed_at' => $order->placed_at?->toIso8601String(),
                'next_statuses' => array_map(
                    static fn (OrderStatus $s): array => ['value' => $s->value, 'label' => $s->label()],
                    $order->status->allowedNext(),
                ),
            ]),
            'meta' => [
                'current_page' => $orders->currentPage(),
                'last_page' => $orders->lastPage(),
                'per_page' => $orders->perPage(),
                'total' => $orders->total(),
            ],
            'summary' => $this->summary(),
        ]);
    }

    public function show(Request $request, Order $order): JsonResponse
    {
        abort_unless($request->user()?->can('orders.view'), 403);

        $order->load([
            'items.variation:id,sku',
            'customer:id,name,phone,email',
            'paymentMethod',
            'shippingZone:id,name',
            'history.user:id,name',
            'payments.method:id,name',
        ]);

        return response()->json([
            'data' => [
                'id' => $order->id,
                'number' => $order->number,
                'status' => $order->status->value,
                'status_label' => $order->status->label(),
                'payment_status' => $order->payment_status->value,
                'payment_status_label' => $order->payment_status->label(),
                'next_statuses' => array_map(
                    static fn (OrderStatus $s): array => ['value' => $s->value, 'label' => $s->label()],
                    $order->status->allowedNext(),
                ),

                'customer' => $order->customer === null ? null : [
                    'id' => $order->customer->id,
                    'name' => $order->customer->name,
                    'phone' => $order->customer->phone,
                    'email' => $order->customer->email,
                ],

                'shipping' => [
                    'name' => $order->ship_name,
                    'phone' => $order->ship_phone,
                    'address_line1' => $order->ship_address_line1,
                    'address_line2' => $order->ship_address_line2,
                    'area' => $order->ship_area,
                    'city' => $order->ship_city,
                    'district' => $order->ship_district,
                    'postcode' => $order->ship_postcode,
                    'zone' => $order->shippingZone?->name,
                    'method' => $order->shipping_method_name,
                ],

                'payment_method' => $order->paymentMethod?->name,
                'is_cod' => $order->paymentMethod?->type->isCollectedOnDelivery() ?? false,

                // The customer's own claim, unverified. Shown so whoever
                // records the payment has the id to look for on the
                // statement instead of asking for it over the phone.
                'payment_reference' => $order->payment_reference,
                'payment_reference_at' => $order->payment_reference_at?->toIso8601String(),

                'subtotal' => $order->subtotal,
                'discount_total' => $order->discount_total,
                'shipping_charge' => $order->shipping_charge,
                'extra_charge' => $order->extra_charge,
                'total' => $order->total,
                'paid_total' => $order->paid_total,
                'refunded_total' => $order->refunded_total,
                'due_total' => $order->dueAmount()->value(),

                'cost_total' => $order->status->hasShipped() ? $order->cost_total : null,
                'gross_profit' => $order->status->hasShipped() ? $order->grossProfit()->value() : null,

                'customer_note' => $order->customer_note,
                'staff_note' => $order->staff_note,
                'cancel_reason' => $order->cancel_reason,

                'placed_at' => $order->placed_at?->toIso8601String(),
                'confirmed_at' => $order->confirmed_at?->toIso8601String(),
                'shipped_at' => $order->shipped_at?->toIso8601String(),
                'delivered_at' => $order->delivered_at?->toIso8601String(),

                'items' => $order->items->map(fn (OrderItem $item): array => [
                    'id' => $item->id,
                    'product_name' => $item->product_name,
                    'variation_name' => $item->variation_name,
                    'sku' => $item->sku,
                    'quantity' => $item->quantity,
                    'unit_price' => $item->unit_price,
                    'line_discount' => $item->line_discount,
                    'line_total' => $item->line_total,
                    'unit_cost' => $item->unit_cost,
                    'total_cost' => $item->total_cost,
                    'gross_profit' => $item->total_cost === null ? null : $item->grossProfit()->value(),
                ])->all(),

                'history' => $order->history->map(fn ($h): array => [
                    'from' => $h->from_status?->value,
                    'to' => $h->to_status->value,
                    'to_label' => $h->to_status->label(),
                    'note' => $h->note,
                    'by' => $h->user?->name,
                    'at' => $h->created_at?->toIso8601String(),
                ])->all(),

                'payments' => $order->payments->map(fn ($p): array => [
                    'id' => $p->id,
                    'number' => $p->number,
                    'amount' => $p->amount,
                    'is_refund' => $p->isRefund(),
                    'method' => $p->method?->name,
                    'reference' => $p->reference,
                    'note' => $p->note,
                    'received_at' => $p->received_at?->toIso8601String(),
                ])->all(),
            ],
        ]);
    }

    /**
     * Move an order along.
     */
    public function updateStatus(Request $request, Order $order): JsonResponse
    {
        abort_unless($request->user()?->can('orders.status'), 403);

        $data = $request->validate([
            'status' => ['required', Rule::in(OrderStatus::values())],
            'note' => ['nullable', 'string', 'max:200'],
        ]);

        $this->statuses->transition(
            order: $order,
            to: OrderStatus::from($data['status']),
            by: $request->user(),
            note: $data['note'] ?? null,
        );

        return response()->json([
            'message' => 'Order updated.',
            'data' => ['status' => $order->refresh()->status->value],
        ]);
    }

    /**
     * Record money received against an order.
     */
    public function recordPayment(Request $request, Order $order): JsonResponse
    {
        abort_unless($request->user()?->can('orders.payment'), 403);

        $data = $request->validate([
            'amount' => ['required', 'numeric', 'min:0.01', 'max:99999999'],
            'payment_method_id' => ['nullable', 'integer', 'exists:payment_methods,id'],
            'reference' => ['nullable', 'string', 'max:120'],
            'note' => ['nullable', 'string', 'max:200'],
            'received_at' => ['nullable', 'date'],
        ]);

        $payment = $this->payments->record(
            order: $order,
            amount: (string) $data['amount'],
            method: isset($data['payment_method_id'])
                ? PaymentMethod::find($data['payment_method_id'])
                : null,
            reference: $data['reference'] ?? null,
            note: $data['note'] ?? null,
            by: $request->user(),
            receivedAt: $data['received_at'] ?? null,
        );

        return response()->json([
            'message' => 'Payment recorded.',
            'data' => ['number' => $payment->number, 'amount' => $payment->amount],
        ], 201);
    }

    public function refund(Request $request, Order $order): JsonResponse
    {
        abort_unless($request->user()?->can('returns.refund'), 403);

        $data = $request->validate([
            'amount' => ['required', 'numeric', 'min:0.01', 'max:99999999'],
            'reason' => ['nullable', 'string', 'max:200'],
        ]);

        $payment = $this->payments->refund(
            order: $order,
            amount: (string) $data['amount'],
            reason: $data['reason'] ?? null,
            by: $request->user(),
        );

        return response()->json([
            'message' => 'Refund recorded.',
            'data' => ['number' => $payment->number, 'amount' => $payment->amount],
        ], 201);
    }

    public function addNote(Request $request, Order $order): JsonResponse
    {
        abort_unless($request->user()?->can('orders.update'), 403);

        $data = $request->validate([
            'staff_note' => ['nullable', 'string', 'max:1000'],
        ]);

        $order->forceFill(['staff_note' => $data['staff_note']])->save();

        return response()->json(['message' => 'Note saved.']);
    }

    /**
     * Counts for the dashboard tiles above the list.
     *
     * @return array<string, mixed>
     */
    private function summary(): array
    {
        $byStatus = Order::query()
            ->selectRaw('status, COUNT(*) as orders, COALESCE(SUM(total), 0) as value')
            ->groupBy('status')
            ->get()
            ->keyBy('status');

        $counts = [];

        foreach (OrderStatus::cases() as $status) {
            $row = $byStatus->get($status->value);

            $counts[$status->value] = [
                'label' => $status->label(),
                'orders' => (int) ($row->orders ?? 0),
                'value' => Money::of((string) ($row->value ?? '0'))->value(),
            ];
        }

        return [
            'by_status' => $counts,
            'awaiting_action' => Order::query()->open()->count(),
        ];
    }
}
