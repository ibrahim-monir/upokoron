<?php

declare(strict_types=1);

namespace App\Services\Pricing;

use App\Exceptions\BusinessRuleException;
use App\Models\Customer;
use App\Models\ProductVariation;
use App\Support\Money;
use App\Support\Quantity;

/**
 * The only thing in the system allowed to decide what something costs.
 *
 * The storefront sends a variation id and a quantity. It does not send a
 * price, and if it did, nothing here would read it. Every figure a customer
 * is charged originates in this class, from the catalogue and the customer's
 * group -- which is the whole of "never trust frontend prices" made
 * structural rather than remembered.
 *
 * Order of operations, and it matters:
 *
 *   1. list price      = the variation's selling price
 *   2. special price   = replaces it outright while the window is open
 *   3. group discount  = a percentage off whatever step 2 left
 *
 * A group discount stacks ON a special rather than competing with it, because
 * the alternative -- taking whichever is lower -- means a wholesale customer
 * can pay MORE during a sale than their standing agreement says, which is the
 * kind of thing that gets noticed by exactly one customer, loudly.
 */
class PricingService
{
    /**
     * Price a single line.
     */
    public function price(
        ProductVariation $variation,
        Quantity|string|int $quantity,
        ?Customer $customer = null,
    ): PricedLine {
        $quantity = Quantity::of($quantity);

        if (! $quantity->isPositive()) {
            throw new BusinessRuleException(
                'A quantity must be more than zero.',
                'invalid_quantity',
            );
        }

        $listPrice = Money::of($variation->selling_price);
        $unitPrice = $variation->effectivePrice();

        $reasons = [];

        if ($variation->hasActiveSpecialPrice()) {
            $reasons[] = 'special';
        }

        $groupPercent = $this->groupDiscountPercent($customer);

        if ($groupPercent !== null) {
            // Round once, at the unit price, and multiply after. Discounting
            // the line total instead gives a unit price that does not divide
            // back into it, and every invoice line then fails to add up by a
            // paisa or two.
            $unitPrice = $unitPrice
                ->minus($unitPrice->times($groupPercent)->dividedBy('100'));

            $reasons[] = 'group';
        }

        // A special price above the list price, or a discount that overshoots,
        // must never produce a negative charge.
        if ($unitPrice->isNegative()) {
            $unitPrice = Money::zero();
        }

        $unitDiscount = $listPrice->greaterThan($unitPrice)
            ? $listPrice->minus($unitPrice)
            : Money::zero();

        return new PricedLine(
            variation: $variation,
            quantity: $quantity,
            listPrice: $listPrice,
            unitPrice: $unitPrice,
            unitDiscount: $unitDiscount,
            lineTotal: $unitPrice->times($quantity->value()),
            lineDiscount: $unitDiscount->times($quantity->value()),
            discountReason: $reasons === [] ? null : implode('+', $reasons),
        );
    }

    /**
     * Price a whole basket.
     *
     * @param  iterable<array{variation: ProductVariation, quantity: Quantity|string|int}>  $lines
     * @return array<int, PricedLine>
     */
    public function priceAll(iterable $lines, ?Customer $customer = null): array
    {
        $priced = [];

        foreach ($lines as $line) {
            $priced[] = $this->price($line['variation'], $line['quantity'], $customer);
        }

        return $priced;
    }

    /**
     * Sum of the line totals, before delivery.
     *
     * @param  array<int, PricedLine>  $lines
     */
    public function subtotal(array $lines): Money
    {
        return array_reduce(
            $lines,
            static fn (Money $carry, PricedLine $line): Money => $carry->plus($line->lineTotal),
            Money::zero(),
        );
    }

    /**
     * How much the customer saved against list.
     *
     * @param  array<int, PricedLine>  $lines
     */
    public function totalDiscount(array $lines): Money
    {
        return array_reduce(
            $lines,
            static fn (Money $carry, PricedLine $line): Money => $carry->plus($line->lineDiscount),
            Money::zero(),
        );
    }

    /**
     * Combined shipping weight.
     *
     * @param  array<int, PricedLine>  $lines
     */
    public function totalWeight(array $lines): Quantity
    {
        return array_reduce(
            $lines,
            static fn (Quantity $carry, PricedLine $line): Quantity => $carry->plus($line->weightKg()),
            Quantity::zero(),
        );
    }

    /**
     * The customer's standing discount, or null if they have none.
     *
     * Blocked customers are not special-cased here: they are stopped from
     * ordering at all, further up. Silently withdrawing their discount would
     * let them shop on at full price without ever being told why.
     */
    private function groupDiscountPercent(?Customer $customer): ?string
    {
        $group = $customer?->group;

        if ($group === null || ! $group->is_active) {
            return null;
        }

        $percent = Money::of($group->discount_percent);

        return $percent->isPositive() ? $percent->value() : null;
    }
}
