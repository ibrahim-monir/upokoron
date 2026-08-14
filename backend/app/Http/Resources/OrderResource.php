<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Models\Order;
use App\Models\OrderItem;
use App\Models\OrderStatusHistory;
use App\Models\Payment;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @mixin Order
 */
class OrderResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        /*
         * Cost and margin are NOT here.
         *
         * This resource is served to the customer who placed the order. What
         * the goods cost the shop is nobody's business but the shop's, and
         * the surest way to keep it that way is for the storefront resource
         * never to be able to say it. The admin resource carries those.
         */
        return [
            'id' => $this->id,
            'number' => $this->number,
            'status' => $this->status->value,
            'status_label' => $this->status->label(),
            'payment_status' => $this->payment_status->value,
            'payment_status_label' => $this->payment_status->label(),

            'payment_method' => $this->whenLoaded('paymentMethod', fn (): ?array => $this->paymentMethod === null ? null : [
                'code' => $this->paymentMethod->code,
                'name' => $this->paymentMethod->name,
                'is_cod' => $this->paymentMethod->type->isCollectedOnDelivery(),
            ]),

            'shipping' => [
                'name' => $this->ship_name,
                'phone' => $this->ship_phone,
                'address_line1' => $this->ship_address_line1,
                'address_line2' => $this->ship_address_line2,
                'area' => $this->ship_area,
                'city' => $this->ship_city,
                'district' => $this->ship_district,
                'postcode' => $this->ship_postcode,
                'method' => $this->shipping_method_name,
            ],

            'subtotal' => $this->subtotal,
            'discount_total' => $this->discount_total,
            'shipping_charge' => $this->shipping_charge,
            'extra_charge' => $this->extra_charge,
            'total' => $this->total,
            'paid_total' => $this->paid_total,
            'due_total' => $this->dueAmount()->value(),

            'customer_note' => $this->customer_note,

            'placed_at' => $this->placed_at?->toIso8601String(),
            'confirmed_at' => $this->confirmed_at?->toIso8601String(),
            'shipped_at' => $this->shipped_at?->toIso8601String(),
            'delivered_at' => $this->delivered_at?->toIso8601String(),
            'cancelled_at' => $this->cancelled_at?->toIso8601String(),

            'can_cancel' => ! $this->status->hasShipped() && ! $this->status->isFinal(),

            'items' => $this->whenLoaded('items', fn () => $this->items->map(fn (OrderItem $item): array => [
                'id' => $item->id,
                'product_variation_id' => $item->product_variation_id,
                'product_name' => $item->product_name,
                'variation_name' => $item->variation_name,
                'sku' => $item->sku,
                'quantity' => $item->quantity,
                'unit_price' => $item->unit_price,
                'line_total' => $item->line_total,
                'line_discount' => $item->line_discount,
            ])),

            'history' => $this->whenLoaded('history', fn () => $this->history->map(fn (OrderStatusHistory $h): array => [
                'status' => $h->to_status->value,
                'status_label' => $h->to_status->label(),
                'note' => $h->note,
                'at' => $h->created_at?->toIso8601String(),
            ])),

            'payments' => $this->whenLoaded('payments', fn () => $this->payments->map(fn (Payment $p): array => [
                'number' => $p->number,
                'amount' => $p->amount,
                'is_refund' => $p->isRefund(),
                'reference' => $p->reference,
                'received_at' => $p->received_at?->toIso8601String(),
            ])),
        ];
    }
}
