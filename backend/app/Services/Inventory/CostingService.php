<?php

declare(strict_types=1);

namespace App\Services\Inventory;

use App\Support\Money;
use App\Support\Quantity;

/**
 * Weighted average cost arithmetic, isolated from persistence.
 *
 * Pure functions over Money and Quantity, so the rules that decide what a sale
 * costs can be reasoned about and tested without a database. Every rule here
 * exists because of a specific way moving-average costing goes wrong; the
 * comments say which.
 */
class CostingService
{
    /**
     * Value coming IN.
     *
     * @return array{quantity: Quantity, value: Money, average: string}
     */
    public function applyInbound(
        Quantity $currentQty,
        Money $currentValue,
        Quantity $inboundQty,
        Money $inboundValue,
    ): array {
        $newQty = $currentQty->plus($inboundQty);
        $newValue = $currentValue->plus($inboundValue);

        return [
            'quantity' => $newQty,
            'value' => $newValue,
            'average' => $this->average($newQty, $newValue),
        ];
    }

    /**
     * Value going OUT at the current weighted average.
     *
     * Two rules make this exact rather than approximately right:
     *
     * 1. When the movement empties the stock, the cost IS the entire
     *    remaining value. Computing qty x average instead leaves a residue
     *    behind on an item with zero units, and Inventory slowly drifts away
     *    from the stock ledger.
     *
     * 2. The cost can never exceed the value actually on hand. Without the
     *    clamp, accumulated rounding could take stock_value negative, which
     *    the CHECK constraint would then reject mid-transaction.
     *
     * @return array{quantity: Quantity, value: Money, average: string, cost: Money}
     */
    public function applyOutbound(
        Quantity $currentQty,
        Money $currentValue,
        Quantity $outboundQty,
    ): array {
        $newQty = $currentQty->minus($outboundQty);

        // Rule 1: last unit out takes everything left with it.
        if (! $newQty->isPositive()) {
            return [
                'quantity' => Quantity::zero(),
                'value' => Money::zero(),
                'average' => '0.000000',
                'cost' => $currentValue,
            ];
        }

        $cost = $currentValue->times($outboundQty->value())
            ->dividedBy($currentQty->value());

        // Rule 2.
        if ($cost->greaterThan($currentValue)) {
            $cost = $currentValue;
        }

        $newValue = $currentValue->minus($cost);

        return [
            'quantity' => $newQty,
            'value' => $newValue,
            'average' => $this->average($newQty, $newValue),
            'cost' => $cost,
        ];
    }

    /**
     * Value going out at a KNOWN unit cost rather than the current average.
     *
     * Used by returns. A sales return restocks at the cost frozen on the
     * original order line, and a purchase return goes back at what the goods
     * were received for. Using today's average instead would invent profit out
     * of a price change -- and always in the flattering direction.
     *
     * @return array{quantity: Quantity, value: Money, average: string, cost: Money}
     */
    public function applyOutboundAtCost(
        Quantity $currentQty,
        Money $currentValue,
        Quantity $outboundQty,
        Money $unitCost,
    ): array {
        $newQty = $currentQty->minus($outboundQty);

        $cost = $unitCost->times($outboundQty->value());

        if ($cost->greaterThan($currentValue)) {
            $cost = $currentValue;
        }

        if (! $newQty->isPositive()) {
            return [
                'quantity' => Quantity::zero(),
                'value' => Money::zero(),
                'average' => '0.000000',
                'cost' => $currentValue,
            ];
        }

        $newValue = $currentValue->minus($cost);

        return [
            'quantity' => $newQty,
            'value' => $newValue,
            'average' => $this->average($newQty, $newValue),
            'cost' => $cost,
        ];
    }

    /**
     * Residue left on an item whose quantity has reached zero.
     *
     * Should always be zero given the rules above, but rounding across
     * millions of movements is exactly the thing that surprises people, so
     * InventoryService checks and writes any residue off to
     * 5300 Inventory Adjustment (Rounding) rather than letting it sit on a
     * product that has none of itself left.
     */
    public function residueAtZero(Quantity $quantity, Money $value): Money
    {
        return $quantity->isPositive() ? Money::zero() : $value;
    }

    /**
     * average = value / quantity, to six decimals.
     */
    public function average(Quantity $quantity, Money $value): string
    {
        if (! $quantity->isPositive()) {
            return '0.000000';
        }

        return bcdiv($value->value(), $quantity->value(), 6);
    }

    /**
     * Unit cost implied by a total and a quantity, for an inbound movement.
     */
    public function unitCostFor(Quantity $quantity, Money $total): string
    {
        if (! $quantity->isPositive()) {
            return '0.000000';
        }

        return bcdiv($total->value(), $quantity->value(), 6);
    }
}
