<?php

declare(strict_types=1);

namespace App\Enums;

enum SettingType: string
{
    case String = 'string';
    case Integer = 'integer';
    case Decimal = 'decimal';
    case Boolean = 'boolean';
    case Json = 'json';
    case ArrayType = 'array';

    /**
     * Cast a stored string back to its PHP type.
     *
     * Decimals stay strings on purpose: they feed money arithmetic, and a
     * float would reintroduce exactly the rounding errors the DECIMAL columns
     * exist to prevent.
     */
    public function cast(?string $value): mixed
    {
        if ($value === null) {
            return null;
        }

        return match ($this) {
            self::String, self::Decimal => $value,
            self::Integer => (int) $value,
            self::Boolean => filter_var($value, FILTER_VALIDATE_BOOL),
            self::Json, self::ArrayType => json_decode($value, true) ?? [],
        };
    }

    /**
     * Serialise a PHP value for storage.
     */
    public function serialize(mixed $value): ?string
    {
        if ($value === null) {
            return null;
        }

        return match ($this) {
            self::Boolean => $value ? '1' : '0',
            self::Json, self::ArrayType => json_encode($value, JSON_UNESCAPED_UNICODE),
            default => (string) $value,
        };
    }

    /**
     * Infer the type from a default value, used when seeding.
     */
    public static function infer(mixed $value): self
    {
        return match (true) {
            is_bool($value) => self::Boolean,
            is_int($value) => self::Integer,
            is_array($value) => self::Json,
            is_string($value) && preg_match('/^-?\d+\.\d+$/', $value) === 1 => self::Decimal,
            default => self::String,
        };
    }
}
