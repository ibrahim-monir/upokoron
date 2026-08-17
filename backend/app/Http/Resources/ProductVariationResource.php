<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Models\ProductVariation;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @mixin ProductVariation
 */
class ProductVariationResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'sku' => $this->sku,
            'barcode' => $this->barcode,
            'name' => $this->name,

            'selling_price' => $this->selling_price,
            'compare_at_price' => $this->compare_at_price,
            'special_price' => $this->special_price,
            'special_starts_at' => $this->special_starts_at?->toIso8601String(),
            'special_ends_at' => $this->special_ends_at?->toIso8601String(),

            // What a customer actually pays. Resolved server-side; the
            // storefront never computes this itself.
            'effective_price' => $this->effectivePrice()->value(),
            'is_on_sale' => $this->hasActiveSpecialPrice(),

            /*
             * What a shopper can actually have, with everyone else's held
             * stock already subtracted.
             *
             * `available`, never `quantity`: showing what is on the shelf
             * would promise units that are sitting in other people's baskets,
             * and the disappointment lands at checkout instead of here.
             * Cost price and the on-hand figure stay out of the storefront
             * entirely -- that is back-office information.
             */
            'available_quantity' => $this->whenLoaded(
                'inventory',
                fn () => $this->inventory?->available()->value() ?? '0.000',
                '0.000',
            ),
            'in_stock' => $this->whenLoaded(
                'inventory',
                fn () => (bool) $this->inventory?->available()->isPositive(),
                false,
            ),

            /*
             * The back-office view of the same row: what is physically on the
             * shelf, what it cost, and when to reorder. Gated on the route
             * because this resource also serves the storefront, which must
             * only ever see `available_quantity` above.
             */
            'stock' => $this->when(
                $request->routeIs('admin.*') && $this->relationLoaded('inventory'),
                fn () => [
                    'quantity' => $this->inventory?->quantity ?? '0.000',
                    'reserved_quantity' => $this->inventory?->reserved_quantity ?? '0.000',
                    'reorder_level' => $this->inventory?->reorder_level ?? '0.000',
                    'average_cost' => $this->inventory?->average_cost ?? '0.000000',
                    // Distinguishes "never stocked" from "sold down to zero".
                    // Only the first may be entered as an opening balance.
                    'has_movements' => $this->inventory?->last_movement_at !== null,
                ],
            ),

            'weight' => $this->weight,
            'is_default' => $this->is_default,
            'is_active' => $this->is_active,
            'position' => $this->position,

            'attributes' => $this->whenLoaded('attributeValues', fn () => $this->attributeValues->map(fn ($v) => [
                'attribute_id' => (int) $v->pivot->attribute_id,
                'attribute' => $v->attribute?->name,
                'value_id' => $v->id,
                'value' => $v->value,
                'color_hex' => $v->color_hex,
            ])),
        ];
    }
}
