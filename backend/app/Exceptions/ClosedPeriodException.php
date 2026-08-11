<?php

declare(strict_types=1);

namespace App\Exceptions;

/**
 * Something tried to post into a closed accounting period.
 *
 * This is the mechanism that keeps history from being rewritten: once a month
 * is closed, a report for that month returns the same numbers forever.
 */
class ClosedPeriodException extends BusinessRuleException
{
    public static function forDate(string $date, string $periodName): self
    {
        return new self(
            "Accounting period [{$periodName}] is closed. Nothing can be posted dated {$date}. ".
            'Post the correction into the current open period instead.',
            'period_closed',
            ['date' => $date, 'period' => $periodName],
        );
    }

    public static function noPeriod(string $date): self
    {
        return new self(
            "No accounting period covers {$date}. Create the fiscal year before posting into it.",
            'no_fiscal_period',
            ['date' => $date],
        );
    }
}
