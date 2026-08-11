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
