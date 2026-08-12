<?php

declare(strict_types=1);

namespace App\Support;

use InvalidArgumentException;
use JsonSerializable;
use Stringable;

/**
 * An exact decimal quantity, to three places.
 *
 * The sibling of Money, and here for the same reason: a float quantity of
 * 0.1 kg added a hundred times is not 10 kg, and stock that drifts is stock
 * that eventually goes negative and takes the weighted average with it.
 *
 * Immutable.
 */
final class Quantity implements JsonSerializable, Stringable
{
    public const SCALE = 3;

    private const WORKING_SCALE = 10;

    private function __construct(private readonly string $amount) {}

    public static function of(string|int|float|self $value): self
    {
        if ($value instanceof self) {
            return $value;
        }

        if (is_float($value)) {
            $value = number_format($value, self::WORKING_SCALE, '.', '');
        }

        $value = trim((string) $value);

        if ($value === '') {
            $value = '0';
        }

        if (! preg_match('/^-?\d+(\.\d+)?$/', $value)) {
            throw new InvalidArgumentException("Not a valid quantity: [{$value}].");
        }

        return new self(self::round($value));
    }

    public static function zero(): self
    {
        return new self(self::round('0'));
    }

    public function plus(string|int|float|self $other): self
    {
        return new self(self::round(bcadd($this->amount, self::of($other)->amount, self::WORKING_SCALE)));
    }

    public function minus(string|int|float|self $other): self
    {
        return new self(self::round(bcsub($this->amount, self::of($other)->amount, self::WORKING_SCALE)));
    }

    public function isZero(): bool
    {
        return bccomp($this->amount, '0', self::SCALE) === 0;
    }

    public function isPositive(): bool
    {
        return bccomp($this->amount, '0', self::SCALE) > 0;
    }

    public function isNegative(): bool
    {
        return bccomp($this->amount, '0', self::SCALE) < 0;
    }

    public function equals(string|int|float|self $other): bool
    {
        return $this->compareTo($other) === 0;
    }

    public function greaterThan(string|int|float|self $other): bool
    {
        return $this->compareTo($other) > 0;
    }

    public function greaterThanOrEqual(string|int|float|self $other): bool
    {
        return $this->compareTo($other) >= 0;
    }

    public function lessThan(string|int|float|self $other): bool
    {
        return $this->compareTo($other) < 0;
    }

    public function compareTo(string|int|float|self $other): int
    {
        return bccomp($this->amount, self::of($other)->amount, self::SCALE);
    }

    /**
     * Whole units only, for products measured in pieces. A unit whose
     * `allow_decimal` is false must never end up holding 2.5 of something.
     */
    public function isWhole(): bool
    {
        return bccomp($this->amount, bcadd($this->amount, '0', 0), self::SCALE) === 0;
    }

    public function value(): string
    {
        return $this->amount;
    }

    /** Trimmed for display: "3" rather than "3.000". */
    public function format(): string
    {
        return rtrim(rtrim($this->amount, '0'), '.') ?: '0';
    }

    public function jsonSerialize(): string
    {
        return $this->amount;
    }

    public function __toString(): string
    {
        return $this->amount;
    }

    private static function round(string $value): string
    {
        if (! str_contains($value, '.')) {
            return bcadd($value, '0', self::SCALE);
        }

        $shift = '0.'.str_repeat('0', self::SCALE).'5';

        return bccomp($value, '0', self::WORKING_SCALE) >= 0
            ? bcadd($value, $shift, self::SCALE)
            : bcsub($value, $shift, self::SCALE);
    }
}
