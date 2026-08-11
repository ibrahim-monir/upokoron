<?php

declare(strict_types=1);

namespace App\Enums;

enum ProductType: string
{
    /** One variation, created automatically and hidden from the admin UI. */
    case Simple = 'simple';

    /** Variations generated from the selected variant attribute values. */
    case Variable = 'variable';

    public function label(): string
    {
        return match ($this) {
            self::Simple => 'Simple product',
            self::Variable => 'Variable product',
        };
    }
}
