<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Models\Product;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @mixin Product
 */
class ProductResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'slug' => $this->slug,
            'type' => $this->type->value,
            'status' => $this->status->value,
            'status_label' => $this->status->label(),
            'is_featured' => $this->is_featured,
            'is_stock_tracked' => $this->is_stock_tracked,
            'published_at' => $this->published_at?->toIso8601String(),

            'short_description' => $this->short_description,
            'description' => $this->when(
                $request->routeIs('*.show'),
                fn () => $this->description,
            ),

            'category' => $this->whenLoaded('category', fn () => [
                'id' => $this->category?->id,
                'name' => $this->category?->name,
                'slug' => $this->category?->slug,
            ]),
            'brand' => $this->whenLoaded('brand', fn () => $this->brand === null ? null : [
                'id' => $this->brand->id,
                'name' => $this->brand->name,
                'slug' => $this->brand->slug,
            ]),
            'unit' => $this->whenLoaded('unit', fn () => $this->unit === null ? null : [
                'id' => $this->unit->id,
                'name' => $this->unit->name,
                'short_name' => $this->unit->short_name,
                'allow_decimal' => $this->unit->allow_decimal,
            ]),
            'additional_categories' => $this->whenLoaded(
                'categories',
                fn () => $this->categories->map(fn ($c) => ['id' => $c->id, 'name' => $c->name]),
            ),

            'weight' => $this->weight,
            'dimensions' => $this->when(
                $this->length !== null || $this->width !== null || $this->height !== null,
                fn () => ['length' => $this->length, 'width' => $this->width, 'height' => $this->height],
            ),
            'warranty' => $this->warranty,
            'additional_info' => $this->additional_info ?? [],

            'seo' => $this->when($request->routeIs('*.show'), fn () => [
                'meta_title' => $this->meta_title,
                'meta_description' => $this->meta_description,
                'meta_keywords' => $this->meta_keywords,
                'canonical_url' => $this->canonical_url,
            ]),

            'primary_image' => $this->whenLoaded(
                'primaryImage',
                fn () => $this->primaryImage?->url(),
            ),
            'images' => $this->whenLoaded('images', fn () => $this->images->map(fn ($i) => [
                'id' => $i->id,
                'url' => $i->url(),
                'alt' => $i->alt,
                'position' => $i->position,
                'is_primary' => $i->is_primary,
            ])),

            'variations_count' => $this->whenCounted('variations'),
            'default_variation' => $this->whenLoaded(
                'defaultVariation',
                fn () => $this->defaultVariation === null
                    ? null
                    : new ProductVariationResource($this->defaultVariation),
            ),
            'variations' => ProductVariationResource::collection($this->whenLoaded('variations')),

            'specifications' => $this->whenLoaded('attributeValues', fn () => $this->attributeValues
                ->groupBy(fn ($v) => $v->attribute->name)
                ->map(fn ($values) => $values->pluck('value'))),

            'sold_count' => $this->sold_count,
            'rating_avg' => $this->rating_avg,
            'rating_count' => $this->rating_count,
            'created_at' => $this->created_at?->toIso8601String(),
            'deleted_at' => $this->deleted_at?->toIso8601String(),
        ];
    }
}
