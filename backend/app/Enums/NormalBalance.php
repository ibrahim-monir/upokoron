<?php

declare(strict_types=1);

namespace App\Enums;

enum NormalBalance: string
{
    case Debit = 'debit';
    case Credit = 'credit';

    /**
     * Sign applied to (debit - credit) so a healthy account reads positive.
     *
     * A bank account with more debits than credits has money in it; a payable
     * with more credits than debits is money owed. Both should show as a
     * positive number to the person reading the report.
     */
    public function sign(): int
    {
        return $this === self::Debit ? 1 : -1;
    }

    public function opposite(): self
    {
        return $this === self::Debit ? self::Credit : self::Debit;
    }
}
