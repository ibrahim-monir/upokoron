<?php

declare(strict_types=1);

namespace App\Exceptions;

use App\Support\Money;

/**
 * The entry's debits and credits do not agree. Always a bug in the calling
 * service, never something a user can cause, so it carries the numbers needed
 * to find the offending line.
 */
class UnbalancedEntryException extends BusinessRuleException
{
    public static function make(string $event, Money $debit, Money $credit): self
    {
        return new self(
            sprintf(
                'Journal entry for [%s] does not balance: debits %s, credits %s, difference %s.',
                $event,
                $debit->value(),
                $credit->value(),
                $debit->minus($credit)->value(),
            ),
            'unbalanced_journal_entry',
            [
                'event' => $event,
                'total_debit' => $debit->value(),
                'total_credit' => $credit->value(),
                'difference' => $debit->minus($credit)->value(),
            ],
            500,
        );
    }
}
