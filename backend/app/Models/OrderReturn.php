<?php

declare(strict_types=1);

namespace App\Models;

use App\Enums\ReturnStatus;
use App\Models\Concerns\Auditable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * A request to send goods from a delivered order back. Written only by
 * ReturnService, through forceFill.
 */
class OrderReturn extends Model
{
    use Auditable;

    protected $fillable = [];

    /** The reasons a customer can give, in the words they are shown. */
    public const REASONS = [
        'damaged' => 'Arrived damaged',
        'faulty' => 'Faulty / not working',
        'wrong_item' => 'Wrong item sent',
        'not_as_described' => 'Not as described',
        'missing_parts' => 'Parts or accessories missing',
        'other' => 'Other',
    ];

    protected function casts(): array
    {
        return [
            'status' => ReturnStatus::class,
            'refund_amount' => 'decimal:2',
            'requested_at' => 'datetime',
            'approved_at' => 'datetime',
            'rejected_at' => 'datetime',
            'received_at' => 'datetime',
            'refunded_at' => 'datetime',
        ];
    }

    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class);
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function items(): HasMany
    {
        return $this->hasMany(OrderReturnItem::class);
    }

    public function handler(): BelongsTo
    {
        return $this->belongsTo(User::class, 'handled_by');
    }
}
