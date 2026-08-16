<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * A shopper's basket.
 *
 * Not Auditable on purpose: carts change on every click, and an audit trail
 * of "quantity 1 -> 2 -> 1" for every visitor would bury the entries that
 * matter -- price changes, stock adjustments, refunds.
 */
class Cart extends Model
{
    protected $fillable = [
        'token', 'customer_id', 'coupon_id', 'status', 'expires_at', 'last_activity_at',
    ];

    protected function casts(): array
    {
        return [
            'expires_at' => 'datetime',
            'last_activity_at' => 'datetime',
        ];
    }

    public function items(): HasMany
    {
        return $this->hasMany(CartItem::class);
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function coupon(): BelongsTo
    {
        return $this->belongsTo(Coupon::class);
    }

    public function scopeActive(Builder $query): Builder
    {
        return $query->where('status', 'active');
    }

    public function isActive(): bool
    {
        return $this->status === 'active';
    }
}
