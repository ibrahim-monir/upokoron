<?php

declare(strict_types=1);

namespace App\Models;

use App\Support\Quantity;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A hold on stock that has not left the building yet.
 *
 * These rows are the truth; `inventories.reserved_quantity` caches their sum
 * so that "available" can be a generated column. ReservationService keeps the
 * two in step and a scheduled command reconciles them.
 */
class StockReservation extends Model
{
    protected $fillable = [
        'product_variation_id',
        'order_id',
        'cart_token',
        'quantity',
        'status',
        'expires_at',
        'released_at',
    ];

    protected function casts(): array
    {
        return [
            'quantity' => 'decimal:3',
            'expires_at' => 'datetime',
            'released_at' => 'datetime',
        ];
    }

    public function variation(): BelongsTo
    {
        return $this->belongsTo(ProductVariation::class, 'product_variation_id');
    }

    public function quantityHeld(): Quantity
    {
        return Quantity::of($this->quantity);
    }

    public function isActive(): bool
    {
        return $this->status === 'active';
    }

    /**
     * A null expiry means hold indefinitely -- a confirmed COD order is not
     * an abandoned cart and must not have its stock released underneath it.
     */
    public function hasExpired(): bool
    {
        return $this->isActive()
            && $this->expires_at !== null
            && $this->expires_at->isPast();
    }

    public function scopeActive(Builder $query): Builder
    {
        return $query->where('status', 'active');
    }

    public function scopeExpired(Builder $query): Builder
    {
        return $query->active()
            ->whereNotNull('expires_at')
            ->where('expires_at', '<=', now());
    }
}
