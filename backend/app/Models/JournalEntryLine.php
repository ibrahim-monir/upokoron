<?php

declare(strict_types=1);

namespace App\Models;

use App\Support\Money;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\MorphTo;
use RuntimeException;

/**
 * One side of one entry. Immutable, like its parent.
 */
class JournalEntryLine extends Model
{
    public $timestamps = false;

    /** @var array<int, string> */
    protected $fillable = [];

    protected function casts(): array
    {
        return [
            'entry_date' => 'date',
            'debit' => 'decimal:2',
            'credit' => 'decimal:2',
            'line_no' => 'integer',
        ];
    }

    protected static function booted(): void
    {
        static::updating(function (): void {
            throw new RuntimeException('Journal entry lines are immutable.');
        });

        // Cascade from a parent entry is impossible (entries cannot be
        // deleted either), so any delete reaching here is a mistake.
        static::deleting(function (): void {
            throw new RuntimeException('Journal entry lines cannot be deleted.');
        });
    }

    public function entry(): BelongsTo
    {
        return $this->belongsTo(JournalEntry::class, 'journal_entry_id');
    }

    public function account(): BelongsTo
    {
        return $this->belongsTo(Account::class);
    }

    /**
     * The customer or supplier this line belongs to, when it is part of a
     * subledger. This is what makes customer and supplier ledgers derivable
     * from the general ledger instead of stored separately.
     */
    public function party(): MorphTo
    {
        return $this->morphTo('party', 'party_type', 'party_id');
    }

    public function debitAmount(): Money
    {
        return Money::of($this->debit);
    }

    public function creditAmount(): Money
    {
        return Money::of($this->credit);
    }

    /**
     * Signed movement: positive for a debit, negative for a credit.
     */
    public function movement(): Money
    {
        return $this->debitAmount()->minus($this->creditAmount());
    }

    public function scopeForParty(Builder $query, string $type, int|string $id): Builder
    {
        return $query->where('party_type', $type)->where('party_id', $id);
    }

    public function scopeBetween(Builder $query, ?string $from, ?string $to): Builder
    {
        return $query
            ->when($from, fn (Builder $q) => $q->where('entry_date', '>=', $from))
            ->when($to, fn (Builder $q) => $q->where('entry_date', '<=', $to));
    }
}
