<?php

declare(strict_types=1);

namespace App\Support;

use InvalidArgumentException;
use JsonSerializable;
use Stringable;

/**
 * An exact decimal money amount, in BDT.
 *
 * Every arithmetic operation goes through bcmath on string operands. PHP
 * floats cannot represent 0.10 exactly, so a float-based ledger drifts by a
 * paisa here and there until the trial balance stops balancing -- which is
 * precisely the failure this class exists to make impossible.
 *
 * Immutable: every operation returns a new instance.
 */
final class Money implements JsonSerializable, Stringable
{
    public const SCALE = 2;

    /**
     * Extra digits carried during intermediate arithmetic so that a chain of
     * operations rounds once, at the end, rather than at every step.
     */
    private const WORKING_SCALE = 10;

    private function __construct(private readonly string $amount) {}

    public static function of(string|int|float|self $value): self
    {
        if ($value instanceof self) {
            return $value;
        }

        if (is_float($value)) {
            // Accepted for ergonomics at the edges (a JSON payload, a config
            // default) but normalised immediately, and never used internally.
            $value = number_format($value, self::WORKING_SCALE, '.', '');
        }

        $value = trim((string) $value);

        if ($value === '') {
            $value = '0';
        }

        if (! preg_match('/^-?\d+(\.\d+)?$/', $value)) {
            throw new InvalidArgumentException("Not a valid money amount: [{$value}].");
        }

        return new self(self::round($value, self::SCALE));
    }

    public static function zero(): self
    {
        return new self(self::round('0', self::SCALE));
    }

    public function plus(string|int|float|self $other): self
    {
        return new self(self::round(
            bcadd($this->amount, self::of($other)->amount, self::WORKING_SCALE),
            self::SCALE,
        ));
    }

    public function minus(string|int|float|self $other): self
    {
        return new self(self::round(
            bcsub($this->amount, self::of($other)->amount, self::WORKING_SCALE),
            self::SCALE,
        ));
    }

    /**
     * Multiply by a quantity or rate. The multiplier is NOT money, so it may
     * carry more decimals than an amount does (a quantity has three, a unit
     * cost six).
     */
    public function times(string|int|float $multiplier): self
    {
        return new self(self::round(
            bcmul($this->amount, self::normalise($multiplier), self::WORKING_SCALE),
            self::SCALE,
        ));
    }

    public function dividedBy(string|int|float $divisor): self
    {
        $divisor = self::normalise($divisor);

        if (bccomp($divisor, '0', self::WORKING_SCALE) === 0) {
            throw new InvalidArgumentException('Refusing to divide money by zero.');
        }

        return new self(self::round(
            bcdiv($this->amount, $divisor, self::WORKING_SCALE),
            self::SCALE,
        ));
    }

    public function negated(): self
    {
        return new self(self::round(bcmul($this->amount, '-1', self::WORKING_SCALE), self::SCALE));
    }

    public function abs(): self
    {
        return $this->isNegative() ? $this->negated() : $this;
    }

    /**
     * Split an amount across weights so the parts sum EXACTLY back to the
     * whole. Rounding remainders go to the largest weight.
     *
     * This is how an order-level discount is pushed down onto line items. Any
     * approach that rounds each share independently leaves a stray paisa,
     * and that paisa is what later makes a partial refund unanswerable.
     *
     * @param  array<int|string, string|int|float>  $weights
     * @return array<int|string, self>
     */
    public function allocate(array $weights): array
    {
        if ($weights === []) {
            throw new InvalidArgumentException('Cannot allocate across an empty set of weights.');
        }

        $total = array_reduce(
            $weights,
            fn (string $carry, $weight) => bcadd($carry, self::normalise($weight), self::WORKING_SCALE),
            '0',
        );

        if (bccomp($total, '0', self::WORKING_SCALE) === 0) {
            // Nothing to weigh by: split as evenly as the currency allows.
            $total = (string) count($weights);
            $weights = array_map(fn () => '1', $weights);
        }

        $shares = [];
        $allocated = self::zero();

        foreach ($weights as $key => $weight) {
            $share = new self(self::round(
                bcdiv(bcmul($this->amount, self::normalise($weight), self::WORKING_SCALE), $total, self::WORKING_SCALE),
                self::SCALE,
            ));

            $shares[$key] = $share;
            $allocated = $allocated->plus($share);
        }

        $remainder = $this->minus($allocated);

        if (! $remainder->isZero()) {
            $largest = array_keys($weights, max($weights), true)[0];
            $shares[$largest] = $shares[$largest]->plus($remainder);
        }

        return $shares;
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
     * The raw decimal string. This is what goes into a DECIMAL column, and
     * the only representation that should ever be persisted.
     */
    public function value(): string
    {
        return $this->amount;
    }

    /**
     * Human-facing, e.g. "৳1,234.50".
     */
    public function format(bool $withSymbol = true): string
    {
        $formatted = number_format((float) $this->amount, self::SCALE, '.', ',');

        return $withSymbol ? config('upokoron.currency.symbol').$formatted : $formatted;
    }

    public function jsonSerialize(): string
    {
        return $this->amount;
    }

    public function __toString(): string
    {
        return $this->amount;
    }

    /**
     * Half-up rounding. bcmath truncates by default, which would quietly bias
     * every rounded amount downwards.
     */
    private static function round(string $value, int $scale): string
    {
        if (str_contains($value, '.') === false) {
            return bcadd($value, '0', $scale);
        }

        $shift = '0.'.str_repeat('0', $scale).'5';

        return bccomp($value, '0', self::WORKING_SCALE) >= 0
            ? bcadd($value, $shift, $scale)
            : bcsub($value, $shift, $scale);
    }

    private static function normalise(string|int|float $value): string
    {
        if (is_float($value)) {
            return number_format($value, self::WORKING_SCALE, '.', '');
        }

        return trim((string) $value);
    }
}
