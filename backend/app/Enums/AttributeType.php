<?php

declare(strict_types=1);

namespace App\Enums;

enum AttributeType: string
{
    case Select = 'select';
    case Color = 'color';
    case Text = 'text';

    public function label(): string
    {
        return match ($this) {
            self::Select => 'Dropdown',
            self::Color => 'Colour swatch',
            self::Text => 'Text',
        };
    }

    public function requiresColorHex(): bool
    {
        return $this === self::Color;
    }
}
