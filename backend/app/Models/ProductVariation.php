<?php

declare(strict_types=1);

namespace App\Models;

use App\Models\Concerns\Auditable;
use App\Support\Money;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Database\Eloquent\Relations\HasOne;

/**
 * The unit everything else in the system attaches to.
 *
 * Inventory, order items, and purchase items all reference a variation, never
 * a product -- which is why even a simple product gets one.
 */
class ProductVariation extends Model
{
    use Auditable, SoftDeletes;

    protected $fillable = [
        'product_id', 'sku', 'barcode', 'name',
        'selling_price', 'compare_at_price',
        'special_price', 'special_starts_at', 'special_ends_at',
        'weight', 'image_id', 'is_default', 'is_active', 'position',
    ];

    protected function casts(): array
    {
        return [
            'selling_price' => 'decimal:2',
            'compare_at_price' => 'decimal:2',
            'special_price' => 'decimal:2',
            'special_starts_at' => 'datetime',
            'special_ends_at' => 'datetime',
            'last_purchase_price' => 'decimal:6',
            'weight' => 'decimal:3',
            'is_default' => 'boolean',
            'is_active' => 'boolean',
        ];
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    public function image(): BelongsTo
    {
        return $this->belongsTo(ProductImage::class, 'image_id');
    }

    public function attributeValues(): BelongsToMany
    {
        return $this->belongsToMany(AttributeValue::class, 'product_variation_values')
            ->withPivot('attribute_id');
    }

    public function inventory(): HasOne
{
    return $this->hasOne(Inventory::class, 'product_variation_id');
}

    /**
     * The price a customer actually pays before any cart-level discount.
     *
     * Resolved server-side, always. The storefront sends product ids and
     * quantities and nothing else; a price arriving from the browser is
     * discarded.
     */
    public function effectivePrice(): Money
    {
        if ($this->hasActiveSpecialPrice()) {
            return Money::of($this->special_price);
        }

        return Money::of($this->selling_price);
    }

    public function hasActiveSpecialPrice(): bool
    {
        if ($this->special_price === null) {
            return false;
        }

        $now = now();

        if ($this->special_starts_at !== null && $now->lessThan($this->special_starts_at)) {
            return false;
        }

        if ($this->special_ends_at !== null && $now->greaterThan($this->special_ends_at)) {
            return false;
        }

        return true;
    }

    /** Human label built from the attribute values, e.g. "Red / XL". */
    public function displayName(): string
    {
        if (filled($this->name)) {
            return $this->name;
        }

        return $this->relationLoaded('attributeValues')
            ? $this->attributeValues->pluck('value')->implode(' / ')
            : '';
    }

    public function scopeActive(Builder $query): Builder
    {
        return $query->where('is_active', true);
    }
}
