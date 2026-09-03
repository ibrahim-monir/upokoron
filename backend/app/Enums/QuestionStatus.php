<?php

declare(strict_types=1);

namespace App\Enums;

/**
 * Where a customer's product question stands in moderation.
 *
 * Anyone can ask without an account, so nothing reaches the product page
 * until staff have looked at it -- the same gate ReviewStatus provides, and
 * a more important one here, because there is no purchase to prove first.
 */
enum QuestionStatus: string
{
    case Pending = 'pending';
    case Approved = 'approved';
    case Rejected = 'rejected';

    public function label(): string
    {
        return match ($this) {
            self::Pending => 'Pending',
            self::Approved => 'Approved',
            self::Rejected => 'Rejected',
        };
    }

    /**
     * @return array<int, string>
     */
    public static function values(): array
    {
        return array_map(static fn (self $case): string => $case->value, self::cases());
    }
}
