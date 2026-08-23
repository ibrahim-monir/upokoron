<?php

declare(strict_types=1);

namespace App\Enums;

/**
 * Why a reward point transaction happened.
 *
 * Earn types carry a FIFO expiry lot (see RewardPointTransaction::remaining_points);
 * spend types never do -- they only ever draw those lots down.
 */
enum RewardPointType: string
{
    case Purchase = 'purchase';
    case Review = 'review';
    case ProfileCompletion = 'profile_completion';
    case Birthday = 'birthday';
    case ManualCredit = 'manual_credit';
    case ManualDebit = 'manual_debit';
    case Redeemed = 'redeemed';
    case Expired = 'expired';

    public function label(): string
    {
        return match ($this) {
            self::Purchase => 'Purchase',
            self::Review => 'Product review',
            self::ProfileCompletion => 'Profile completion',
            self::Birthday => 'Birthday bonus',
            self::ManualCredit => 'Manual credit',
            self::ManualDebit => 'Manual debit',
            self::Redeemed => 'Redeemed at checkout',
            self::Expired => 'Expired',
        };
    }

    /** Creates a lot that ages towards expiry and can be drawn down by a later spend. */
    public function isEarn(): bool
    {
        return in_array($this, [self::Purchase, self::Review, self::ProfileCompletion, self::Birthday, self::ManualCredit], true);
    }

    /**
     * @return array<int, string>
     */
    public static function values(): array
    {
        return array_map(static fn (self $case): string => $case->value, self::cases());
    }
}
