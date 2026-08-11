<?php

declare(strict_types=1);

namespace App\Models;

use App\Enums\JournalEntryStatus;
use App\Support\Money;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\MorphTo;
use RuntimeException;

/**
 * A balanced set of debits and credits. Immutable once written.
 *
 * Nothing outside JournalService may create one of these, and nothing at all
 * may update or delete one -- the model blocks both. Corrections are made by
 * posting a reversing entry, so the original stays visible in the ledger and
 * the audit trail survives.
 */
class JournalEntry extends Model
{
    public const UPDATED_AT = null;

    /**
     * Deliberately empty. JournalService writes via forceCreate after it has
     * validated the entry balances; there is no mass-assignable path in.
     *
     * @var array<int, string>
     */
    protected $fillable = [];

    protected function casts(): array
    {
        return [
            'entry_date' => 'date',
            'status' => JournalEntryStatus::class,
            'total_debit' => 'decimal:2',
            'total_credit' => 'decimal:2',
            'posted_at' => 'datetime',
            'created_at' => 'datetime',
        ];
    }

    protected static function booted(): void
    {
        static::updating(function (self $entry): void {
            throw new RuntimeException(
                'Journal entries are immutable. Post a reversing entry instead of editing entry '.$entry->number.'.'
            );
        });

        static::deleting(function (self $entry): void {
            throw new RuntimeException(
                'Journal entries cannot be deleted. Reverse entry '.$entry->number.' instead.'
            );
        });
    }

    public function lines(): HasMany
    {
        return $this->hasMany(JournalEntryLine::class)->orderBy('line_no');
    }

    public function fiscalPeriod(): BelongsTo
    {
        return $this->belongsTo(FiscalPeriod::class);
    }

    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    /**
     * The document this entry was produced from -- an order, a purchase
     * receipt, an expense.
     */
    public function reference(): MorphTo
    {
        return $this->morphTo('reference', 'reference_type', 'reference_id');
    }

    public function reversalOf(): BelongsTo
    {
        return $this->belongsTo(self::class, 'reversal_of_entry_id');
    }

    public function reversedBy(): BelongsTo
    {
        return $this->belongsTo(self::class, 'reversed_by_entry_id');
    }

    public function totalDebit(): Money
    {
        return Money::of($this->total_debit);
    }

    public function totalCredit(): Money
    {
        return Money::of($this->total_credit);
    }

    public function isReversed(): bool
    {
        return $this->status === JournalEntryStatus::Reversed;
    }

    public function isReversal(): bool
    {
        return $this->status === JournalEntryStatus::Reversal;
    }

    public function scopeForSource(Builder $query, string $type, int|string $id): Builder
    {
        return $query->where('reference_type', $type)->where('reference_id', $id);
    }

    public function scopeBetween(Builder $query, ?string $from, ?string $to): Builder
    {
        return $query
            ->when($from, fn (Builder $q) => $q->where('entry_date', '>=', $from))
            ->when($to, fn (Builder $q) => $q->where('entry_date', '<=', $to));
    }
}
