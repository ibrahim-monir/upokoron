<?php

declare(strict_types=1);

namespace App\Enums;

/**
 * The six top-level buckets every account falls into. Drives which financial
 * statement an account appears on and how its balance is derived.
 */
enum AccountCategory: string
{
    case Asset = 'asset';
    case Liability = 'liability';
    case Equity = 'equity';
    case Revenue = 'revenue';
    case Cogs = 'cogs';
    case Expense = 'expense';

    public function label(): string
    {
        return match ($this) {
            self::Asset => 'Assets',
            self::Liability => 'Liabilities',
            self::Equity => 'Equity',
            self::Revenue => 'Revenue',
            self::Cogs => 'Cost of Goods Sold',
            self::Expense => 'Expenses',
        };
    }

    /**
     * Balance sheet accounts carry forward year to year; profit and loss
     * accounts reset at year end into retained earnings.
     */
    public function isBalanceSheet(): bool
    {
        return in_array($this, [self::Asset, self::Liability, self::Equity], true);
    }

    public function isProfitAndLoss(): bool
    {
        return ! $this->isBalanceSheet();
    }

    /**
     * The side a category normally sits on. Individual accounts may override
     * this -- contra-revenue accounts such as Sales Returns live under Revenue
     * but carry a debit balance.
     */
    public function defaultNormalBalance(): NormalBalance
    {
        return match ($this) {
            self::Asset, self::Cogs, self::Expense => NormalBalance::Debit,
            self::Liability, self::Equity, self::Revenue => NormalBalance::Credit,
        };
    }
}
