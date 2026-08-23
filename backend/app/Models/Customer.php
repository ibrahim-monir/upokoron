<?php

declare(strict_types=1);

namespace App\Models;

use App\Models\Concerns\Auditable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Eloquent\SoftDeletes;

class Customer extends Model
{
    use Auditable, HasFactory, SoftDeletes;

    protected $fillable = [
        'user_id',
        'customer_group_id',
        'code',
        'name',
        'phone',
        'email',
        'gender',
        'date_of_birth',
        'is_blocked',
        'notes',
    ];

    protected function casts(): array
    {
        return [
            'date_of_birth' => 'date',
            'is_blocked' => 'boolean',
            'total_spent' => 'decimal:2',
            'last_order_at' => 'datetime',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function group(): BelongsTo
    {
        return $this->belongsTo(CustomerGroup::class, 'customer_group_id');
    }

    public function addresses(): HasMany
    {
        return $this->hasMany(CustomerAddress::class);
    }

    /** Payment details this customer saved for themselves. */
    public function paymentMethods(): HasMany
    {
        return $this->hasMany(CustomerPaymentMethod::class);
    }

    public function defaultShippingAddress(): HasOne
    {
        return $this->hasOne(CustomerAddress::class)->where('is_default_shipping', true);
    }

    public function rewardPointTransactions(): HasMany
    {
        return $this->hasMany(RewardPointTransaction::class);
    }
}
