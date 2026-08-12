<?php

declare(strict_types=1);

namespace App\Models;

use App\Support\Money;
use App\Support\Quantity;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Stock and value for one variation.
 *
 * `quantity` and `stock_value` are authoritative; `average_cost` is derived
 * from them. Nothing outside InventoryService may write to this table -- the
 * model has an empty $fillable to keep that honest.
 */
class Inventory extends Model
{
    /** @var array<int, string> */
    protected $fillable = [];

    protected function casts(): array
    {
        return [
            'quantity' => 'decimal:3',
            'reserved_quantity' => 'decimal:3',
            'available_quantity' => 'decimal:3',
            'stock_value' => 'decimal:2',
            'average_cost' => 'decimal:6',
            'min_stock' => 'decimal:3',
            'reorder_level' => 'decimal:3',
            'max_stock' => 'decimal:3',
            'last_purchase_price' => 'decimal:6',
            'last_movement_at' => 'datetime',
        ];
    }

    public function variation(): BelongsTo
    {
        return $this->belongsTo(ProductVariation::class, 'product_variation_id');
    }

    public function transactions(): HasMany
    {
        return $this->hasMany(InventoryTransaction::class);
    }

    public function reservations(): HasMany
    {
        return $this->hasMany(StockReservation::class, 'product_variation_id', 'product_variation_id');
    }

    public function onHand(): Quantity
    {
        return Quantity::of($this->quantity);
    }

    public function reserved(): Quantity
    {
        return Quantity::of($this->reserved_quantity);
    }

    /** What can actually be sold: on hand less what is already spoken for. */
    public function available(): Quantity
    {
        return $this->onHand()->minus($this->reserved());
    }

    public function value(): Money
    {
        return Money::of($this->stock_value);
    }

    public function isBelowReorderLevel(): bool
    {
        return Quantity::of($this->reorder_level)->isPositive()
            && $this->onHand()->lessThan(Quantity::of($this->reorder_level));
    }

    public function isOutOfStock(): bool
    {
        return ! $this->available()->isPositive();
    }

    public function scopeLowStock(Builder $query): Builder
    {
        return $query->whereColumn('quantity', '<=', 'reorder_level')
            ->where('reorder_level', '>', 0);
    }

    public function scopeOutOfStock(Builder $query): Builder
    {
        return $query->where('available_quantity', '<=', 0);
    }

    public function scopeInStock(Builder $query): Builder
    {
        return $query->where('available_quantity', '>', 0);
    }
}
