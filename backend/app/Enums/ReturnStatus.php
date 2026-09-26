<?php

declare(strict_types=1);

namespace App\Enums;

/**
 * Where a return is. See the order_returns migration for the flow.
 */
enum ReturnStatus: string
{
    case Requested = 'requested';
    case Approved = 'approved';
    case Rejected = 'rejected';
    case Received = 'received';
    case Refunded = 'refunded';

    public function label(): string
    {
        return match ($this) {
            self::Requested => 'Requested',
            self::Approved => 'Approved — waiting for the goods',
            self::Rejected => 'Rejected',
            self::Received => 'Received',
            self::Refunded => 'Refunded',
        };
    }

    /** Still holding quantity that no other return can claim. */
    public function isOpen(): bool
    {
        return in_array($this, [self::Requested, self::Approved], true);
    }

    /**
     * @return array<int, string>
     */
    public static function values(): array
    {
        return array_map(static fn (self $case): string => $case->value, self::cases());
    }
}
