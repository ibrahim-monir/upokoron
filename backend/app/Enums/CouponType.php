<?php

declare(strict_types=1);

namespace App\Enums;

enum CouponType: string
{
    case Percentage = 'percentage';
    case Fixed = 'fixed';

    public function label(): string
    {
        return match ($this) {
            self::Percentage => 'Percentage off',
            self::Fixed => 'Fixed amount off',
        };
    }
}
