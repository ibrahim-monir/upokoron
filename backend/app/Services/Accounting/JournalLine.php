<?php

declare(strict_types=1);

namespace App\Services\Accounting;

use App\Models\Account;
use App\Support\Money;
use Illuminate\Database\Eloquent\Model;
use InvalidArgumentException;

/**
 * One side of a journal entry, described before it is written.
 *
 * Using a typed object rather than a loose array means a caller cannot
 * silently misspell 'debit' and post a zero, and the account can be given as
 * a system key, an id, or a model without every caller repeating the lookup.
 */
final class JournalLine
{
    private function __construct(
        public readonly Account|int|string $account,
        public readonly Money $debit,
        public readonly Money $credit,
        public readonly ?string $partyType = null,
        public readonly int|string|null $partyId = null,
        public readonly ?string $memo = null,
    ) {
        if ($debit->isNegative() || $credit->isNegative()) {
            throw new InvalidArgumentException(
                'A journal line cannot carry a negative amount. Put the value on the other side instead.'
            );
        }

        if ($debit->isZero() && $credit->isZero()) {
            throw new InvalidArgumentException('A journal line must carry a non-zero amount.');
        }

        if (! $debit->isZero() && ! $credit->isZero()) {
            throw new InvalidArgumentException('A journal line is one-sided: set either debit or credit, not both.');
        }
    }

    public static function debit(
        Account|int|string $account,
        Money|string|int|float $amount,
        ?Model $party = null,
        ?string $memo = null,
    ): self {
        return new self(
            $account,
            Money::of($amount),
            Money::zero(),
            $party?->getMorphClass(),
            $party?->getKey(),
            $memo,
        );
    }

    public static function credit(
        Account|int|string $account,
        Money|string|int|float $amount,
        ?Model $party = null,
        ?string $memo = null,
    ): self {
        return new self(
            $account,
            Money::zero(),
            Money::of($amount),
            $party?->getMorphClass(),
            $party?->getKey(),
            $memo,
        );
    }

    /**
     * Mirror this line for a reversing entry.
     */
    public function reversed(): self
    {
        return new self(
            $this->account,
            $this->credit,
            $this->debit,
            $this->partyType,
            $this->partyId,
            $this->memo,
        );
    }
}
