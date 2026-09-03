<?php

declare(strict_types=1);

namespace App\Models;

use App\Enums\PaymentMethodType;
use App\Models\Concerns\Auditable;
use App\Support\Money;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PaymentMethod extends Model
{
    use Auditable;

    protected $fillable = [
        'name', 'code', 'type', 'instructions', 'receive_number', 'account_id',
        'extra_charge', 'min_order_total', 'max_order_total',
        'is_active', 'position',
        'logo',
    ];

    protected function casts(): array
    {
        return [
            'type' => PaymentMethodType::class,
            'extra_charge' => 'decimal:2',
            'min_order_total' => 'decimal:2',
            'max_order_total' => 'decimal:2',
            'is_active' => 'boolean',
        ];
    }

    public function account(): BelongsTo
    {
        return $this->belongsTo(Account::class);
    }

    /**
     * Where money taken by this method LANDS -- the cash box, the bank, the
     * wallet. Never the debt it settles; see PaymentMethodType.
     *
     * The row's own account wins, so two bKash numbers can be told apart in
     * a report; the type's default is the fallback.
     */
    public function accountKey(): Account|string
    {
        return $this->account ?? $this->type->defaultAccountKey();
    }

    /** Does the customer have a transaction id to give for this method? */
    public function collectsReference(): bool
    {
        return $this->type->collectsReference();
    }

    /**
     * Can this method be offered for an order of this size?
     *
     * Order limits are how a shop stops COD on a ৳80,000 order that would
     * put that much cash in a courier's bag.
     */
    public function acceptsTotal(Money $total): bool
    {
        if ($this->min_order_total !== null && $total->lessThan(Money::of($this->min_order_total))) {
            return false;
        }

        if ($this->max_order_total !== null && $total->greaterThan(Money::of($this->max_order_total))) {
            return false;
        }

        return true;
    }

    public function scopeActive(Builder $query): Builder
    {
        return $query->where('is_active', true);
    }
}
