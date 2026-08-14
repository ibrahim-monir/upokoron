<?php

declare(strict_types=1);

namespace App\Models;

use App\Models\Concerns\Auditable;
use App\Support\Money;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Money in, or money back out.
 *
 * Signed: positive is a receipt, negative is a refund. Payments are never
 * deleted -- a mistake is corrected by recording the opposite, which is what
 * keeps the ledger and this table telling the same story.
 */
class Payment extends Model
{
    use Auditable;

    protected $fillable = [];

    protected function casts(): array
    {
        return [
            'amount' => 'decimal:2',
            'received_at' => 'datetime',
        ];
    }

    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class);
    }

    public function method(): BelongsTo
    {
        return $this->belongsTo(PaymentMethod::class, 'payment_method_id');
    }

    public function account(): BelongsTo
    {
        return $this->belongsTo(Account::class);
    }

    public function journalEntry(): BelongsTo
    {
        return $this->belongsTo(JournalEntry::class);
    }

    public function amount(): Money
    {
        return Money::of($this->amount);
    }

    public function isRefund(): bool
    {
        return $this->amount()->isNegative();
    }

    public function scopeReceipts(Builder $query): Builder
    {
        return $query->where('amount', '>', 0);
    }

    public function scopeRefunds(Builder $query): Builder
    {
        return $query->where('amount', '<', 0);
    }
}
