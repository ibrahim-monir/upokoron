<?php

declare(strict_types=1);

namespace App\Models;

use App\Enums\CouponType;
use App\Models\Concerns\Auditable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

class Coupon extends Model
{
    use Auditable, SoftDeletes;

    protected $fillable = [
        'code', 'name', 'type', 'value', 'max_discount_amount', 'min_order_total',
        'usage_limit', 'usage_limit_per_customer', 'customer_group_id',
        'starts_at', 'expires_at', 'is_active', 'created_by',
    ];

    protected function casts(): array
    {
        return [
            'type' => CouponType::class,
            'value' => 'decimal:2',
            'max_discount_amount' => 'decimal:2',
            'min_order_total' => 'decimal:2',
            'starts_at' => 'datetime',
            'expires_at' => 'datetime',
            'is_active' => 'boolean',
        ];
    }

    public function customerGroup(): BelongsTo
    {
        return $this->belongsTo(CustomerGroup::class);
    }

    public function scopeActive(Builder $query): Builder
    {
        return $query->where('is_active', true);
    }

    public function isWithinWindow(): bool
    {
        $now = now();

        if ($this->starts_at !== null && $now->lt($this->starts_at)) {
            return false;
        }

        return $this->expires_at === null || ! $now->gt($this->expires_at);
    }

    public function hasRemainingUses(): bool
    {
        return $this->usage_limit === null || $this->used_count < $this->usage_limit;
    }
}
