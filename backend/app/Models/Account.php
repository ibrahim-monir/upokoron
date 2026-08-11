<?php

declare(strict_types=1);

namespace App\Models;

use App\Enums\AccountCategory;
use App\Enums\NormalBalance;
use App\Models\Concerns\Auditable;
use App\Support\Money;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Account extends Model
{
    use Auditable;

    protected $fillable = [
        'code',
        'name',
        'account_type_id',
        'parent_id',
        'is_group',
        'system_key',
        'is_system',
        'opening_balance',
        'opening_balance_date',
        'is_active',
        'description',
    ];

    protected function casts(): array
    {
        return [
            'is_group' => 'boolean',
            'is_system' => 'boolean',
            'is_active' => 'boolean',
            'opening_balance' => 'decimal:2',
            'opening_balance_date' => 'date',
        ];
    }

    public function type(): BelongsTo
    {
        return $this->belongsTo(AccountType::class, 'account_type_id');
    }

    public function parent(): BelongsTo
    {
        return $this->belongsTo(self::class, 'parent_id');
    }

    public function children(): HasMany
    {
        return $this->hasMany(self::class, 'parent_id');
    }

    public function lines(): HasMany
    {
        return $this->hasMany(JournalEntryLine::class);
    }

    public function category(): AccountCategory
    {
        return $this->type->category;
    }

    public function normalBalance(): NormalBalance
    {
        return $this->type->normal_balance;
    }

    /**
     * Balance as of a date, signed so a healthy account reads positive.
     *
     * Reversal entries are ordinary entries with their own lines, so they are
     * included here like any other -- no status filtering, or a reversal would
     * cancel nothing.
     */
    public function balanceAsOf(?string $date = null): Money
    {
        $query = $this->lines();

        if ($date !== null) {
            $query->where('entry_date', '<=', $date);
        }

        $totals = $query
            ->selectRaw('COALESCE(SUM(debit), 0) as d, COALESCE(SUM(credit), 0) as c')
            ->first();

        $movement = Money::of($totals->d)->minus(Money::of($totals->c));

        $balance = Money::of($this->opening_balance)->plus($movement);

        return $this->normalBalance() === NormalBalance::Debit ? $balance : $balance->negated();
    }

    public function scopePostable(Builder $query): Builder
    {
        return $query->where('is_group', false)->where('is_active', true);
    }

    public function scopeCategory(Builder $query, AccountCategory $category): Builder
    {
        return $query->whereHas('type', fn (Builder $q) => $q->where('category', $category->value));
    }
}
