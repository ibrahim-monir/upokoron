<?php

declare(strict_types=1);

namespace App\Enums;

/**
 * How much of an order has been paid for.
 *
 * Derived from the payments actually recorded against the order, never set by
 * hand. A status that can be typed in is a status that will eventually
 * disagree with the money.
 */
enum PaymentStatus: string
{
    case Unpaid = 'unpaid';

    /** Some money in, but not all. An advance on a COD order, usually. */
    case Partial = 'partial';

    case Paid = 'paid';

    /** Money went back out. Kept distinct from Unpaid, which never had any. */
    case Refunded = 'refunded';

    public function label(): string
    {
        return match ($this) {
            self::Unpaid => 'Unpaid',
            self::Partial => 'Partially paid',
            self::Paid => 'Paid',
            self::Refunded => 'Refunded',
        };
    }
}
