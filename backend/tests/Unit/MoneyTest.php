<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Support\Money;
use InvalidArgumentException;
// Laravel's base test case, not PHPUnit's: Money::format() reads the currency
// symbol from config, which needs a booted container.
use Tests\TestCase;

class MoneyTest extends TestCase
{
    public function test_it_adds_and_subtracts_exactly(): void
    {
        $this->assertSame('30.00', Money::of('10.00')->plus('20.00')->value());
        $this->assertSame('7.50', Money::of('10.00')->minus('2.50')->value());
    }

    /**
     * The reason this class exists. In float arithmetic 0.1 + 0.2 is
     * 0.30000000000000004, and a ledger built on that eventually stops
     * balancing by a paisa nobody can find.
     */
    public function test_it_does_not_inherit_float_error(): void
    {
        $sum = Money::zero();

        for ($i = 0; $i < 10; $i++) {
            $sum = $sum->plus('0.10');
        }

        $this->assertSame('1.00', $sum->value());
        $this->assertTrue($sum->equals('1.00'));
    }

    public function test_it_rounds_half_up_rather_than_truncating(): void
    {
        // bcmath truncates by default, which would bias every rounded amount
        // downwards over millions of lines.
        $this->assertSame('0.13', Money::of('0.125')->value());
        $this->assertSame('2.35', Money::of('2.345')->value());
        $this->assertSame('-0.13', Money::of('-0.125')->value());
    }

    public function test_it_multiplies_by_a_quantity(): void
    {
        $this->assertSame('550.00', Money::of('110.00')->times('5')->value());
        $this->assertSame('137.50', Money::of('110.00')->times('1.25')->value());
    }

    public function test_it_multiplies_by_a_six_decimal_unit_cost(): void
    {
        // Weighted average cost carries six decimals; the product still lands
        // on a clean two-decimal amount.
        $this->assertSame('366.67', Money::of('1.000000')->times('366.666667')->value());
    }

    public function test_it_refuses_division_by_zero(): void
    {
        $this->expectException(InvalidArgumentException::class);

        Money::of('100.00')->dividedBy('0');
    }

    public function test_it_rejects_a_malformed_amount(): void
    {
        $this->expectException(InvalidArgumentException::class);

        Money::of('not-a-number');
    }

    public function test_comparisons(): void
    {
        $ten = Money::of('10.00');

        $this->assertTrue($ten->greaterThan('9.99'));
        $this->assertTrue($ten->lessThan('10.01'));
        $this->assertTrue($ten->greaterThanOrEqual('10.00'));
        $this->assertTrue($ten->equals('10.000'));
        $this->assertTrue(Money::zero()->isZero());
        $this->assertTrue(Money::of('-1')->isNegative());
    }

    // ─── Allocation: the rule that makes partial refunds answerable ──────

    public function test_allocation_sums_back_to_the_original_exactly(): void
    {
        $discount = Money::of('500.00');

        $shares = $discount->allocate(['a' => '300', 'b' => '300', 'c' => '400']);

        $total = array_reduce($shares, fn (Money $c, Money $s) => $c->plus($s), Money::zero());

        $this->assertSame('500.00', $total->value());
    }

    /**
     * The awkward case: 100 split three ways is 33.333... Naive rounding
     * gives 33.33 x 3 = 99.99 and loses a paisa. The remainder has to land
     * somewhere, and it lands on the largest weight.
     */
    public function test_allocation_gives_the_rounding_remainder_to_the_largest_line(): void
    {
        $shares = Money::of('100.00')->allocate(['a' => '1', 'b' => '1', 'c' => '1']);

        $total = array_reduce($shares, fn (Money $c, Money $s) => $c->plus($s), Money::zero());

        $this->assertSame('100.00', $total->value());
        $this->assertContains('33.33', array_map(fn (Money $m) => $m->value(), $shares));
    }

    public function test_allocation_is_proportional_to_weight(): void
    {
        $shares = Money::of('90.00')->allocate([1000, 2000]);

        $this->assertSame('30.00', $shares[0]->value());
        $this->assertSame('60.00', $shares[1]->value());
    }

    public function test_allocation_across_zero_weights_splits_evenly(): void
    {
        $shares = Money::of('10.00')->allocate(['a' => '0', 'b' => '0']);

        $total = array_reduce($shares, fn (Money $c, Money $s) => $c->plus($s), Money::zero());

        $this->assertSame('10.00', $total->value());
    }

    public function test_allocation_of_an_odd_amount_still_reconciles(): void
    {
        // 1,234.57 spread over three uneven lines: the parts must still sum
        // to the whole, or a partial return would refund the wrong figure.
        $shares = Money::of('1234.57')->allocate(['x' => '333', 'y' => '333', 'z' => '334']);

        $total = array_reduce($shares, fn (Money $c, Money $s) => $c->plus($s), Money::zero());

        $this->assertSame('1234.57', $total->value());
    }

    public function test_it_formats_for_display(): void
    {
        config()->set('upokoron.currency.symbol', '৳');

        $this->assertSame('৳1,234.50', Money::of('1234.50')->format());
        $this->assertSame('1,234.50', Money::of('1234.50')->format(withSymbol: false));
    }
}
