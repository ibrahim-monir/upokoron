<?php

declare(strict_types=1);

namespace App\Enums;

/**
 * Where a customer review stands in moderation.
 *
 * Only an Approved review counts towards a product's rating_avg/rating_count
 * or appears on the storefront -- a Pending one is invisible until staff act
 * on it, exactly like a draft product.
 */
enum ReviewStatus: string
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
