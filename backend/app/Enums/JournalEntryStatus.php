<?php

declare(strict_types=1);

namespace App\Enums;

enum JournalEntryStatus: string
{
    /** Live and included in every balance. */
    case Posted = 'posted';

    /** Superseded by a reversing entry. Both remain in the ledger. */
    case Reversed = 'reversed';

    /** The mirror entry that cancelled another. */
    case Reversal = 'reversal';

    public function label(): string
    {
        return match ($this) {
            self::Posted => 'Posted',
            self::Reversed => 'Reversed',
            self::Reversal => 'Reversal',
        };
    }
}
