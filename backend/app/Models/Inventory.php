<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Inventory extends Model
{
    protected $fillable = [
        'product_variation_id',
        'quantity',
        'reserved_quantity',
        'average_cost',
        'stock_value',
    ];

    protected function casts(): array
    {
        return [
            'quantity' => 'decimal:3',
            'reserved_quantity' => 'decimal:3',
            'average_cost' => 'decimal:6',
            'stock_value' => 'decimal:6',
        ];
    }

    public function variation(): BelongsTo
    {
        return $this->belongsTo(ProductVariation::class, 'product_variation_id');
    }

    public function transactions(): HasMany
    {
        return $this->hasMany(
            InventoryTransaction::class,
            'inventory_id'
        )->latest('id');
    }

    public function availableQuantity(): string
    {
        return bcsub(
            (string) $this->quantity,
            (string) $this->reserved_quantity,
            3
        );
    }

    public function scopeLowStock(
        Builder $query,
        float $threshold = 5
    ): Builder {
        return $query->whereRaw(
            '(quantity - reserved_quantity) <= ?',
            [$threshold]
        );
    }
}