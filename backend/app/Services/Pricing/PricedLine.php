<?php

declare(strict_types=1);

namespace App\Services\Pricing;

use App\Models\ProductVariation;
use App\Support\Money;
use App\Support\Quantity;
use JsonSerializable;

/**
 * What one line of a basket costs, with every step shown.
 *
 * Immutable, and built only by PricingService. The breakdown is carried
 * around rather than recomputed: the storefront, the order snapshot, and the
 * accounting entries must all agree on the same numbers, and the surest way
 * to make them disagree is to let each work the figures out for itself.
 */
final class PricedLine implements JsonSerializable
{
    public function __construct(
        public readonly ProductVariation $variation,
        public readonly Quantity $quantity,
        /** Catalogue price before any discount. */
        public readonly Money $listPrice,
        /** What one unit actually costs after specials and group discount. */
        public readonly Money $unitPrice,
        /** listPrice - unitPrice, per unit. */
        public readonly Money $unitDiscount,
        /** unitPrice * quantity. */
        public readonly Money $lineTotal,
        /** unitDiscount * quantity. */
        public readonly Money $lineDiscount,
        /** Why the price moved: 'special', 'group', 'special+group', or null. */
        public readonly ?string $discountReason,
    ) {}

    /**
     * Shipping weight for this line. Zero when the variation has no weight
     * recorded, which most of this catalogue does not -- a missing weight
     * must not block a delivery quote.
     */
    public function weightKg(): Quantity
    {
        if ($this->variation->weight === null) {
            return Quantity::zero();
        }

        return Quantity::of(bcmul(
            (string) $this->variation->weight,
            $this->quantity->value(),
            Quantity::SCALE,
        ));
    }

    /**
     * @return array<string, mixed>
     */
    public function jsonSerialize(): array
    {
        return [
            'product_variation_id' => $this->variation->id,
            'quantity' => $this->quantity->value(),
            'list_price' => $this->listPrice->value(),
            'unit_price' => $this->unitPrice->value(),
            'unit_discount' => $this->unitDiscount->value(),
            'line_total' => $this->lineTotal->value(),
            'line_discount' => $this->lineDiscount->value(),
            'discount_reason' => $this->discountReason,
        ];
    }
}
