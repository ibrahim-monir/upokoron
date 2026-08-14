<?php

declare(strict_types=1);

namespace App\Enums;

enum ProductStatus: string
{
    /** Being written. Never visible on the storefront. */
    case Draft = 'draft';

    /** Live, subject to `published_at`. */
    case Active = 'active';

    /**
     * Withdrawn from sale but kept for history. Archived rather than deleted,
     * because past orders reference it and reports still need the rows.
     */
    case Archived = 'archived';

    public function label(): string
    {
        return match ($this) {
            self::Draft => 'Draft',
            self::Active => 'Active',
            self::Archived => 'Archived',
        };
    }

    public function isSellable(): bool
    {
        return $this === self::Active;
    }

    /**
     * @return array<int, string>
     */
    public static function values(): array
    {
        return array_map(static fn (self $case): string => $case->value, self::cases());
    }
}
