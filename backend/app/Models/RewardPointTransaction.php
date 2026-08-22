<?php

declare(strict_types=1);

namespace App\Models;

use App\Enums\RewardPointType;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class RewardPointTransaction extends Model
{
    /**
     * Deliberately empty. Every column here is written by RewardPointsService
     * from a rule the service itself decided, never from a request body.
     */
    protected $fillable = [];

    protected function casts(): array
    {
        return [
            'type' => RewardPointType::class,
            'expires_at' => 'datetime',
        ];
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class);
    }

    public function productReview(): BelongsTo
    {
        return $this->belongsTo(ProductReview::class);
    }

    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    /** Earn lots that still have something left to draw down, oldest first. */
    public function scopeOpenLots(Builder $query): Builder
    {
        return $query->where('remaining_points', '>', 0)->oldest('id');
    }

    /** Open lots whose expiry has arrived. */
    public function scopeDueToExpire(Builder $query): Builder
    {
        return $query->openLots()->whereNotNull('expires_at')->where('expires_at', '<=', now());
    }
}
