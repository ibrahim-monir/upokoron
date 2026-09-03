<?php

declare(strict_types=1);

namespace App\Enums;

/**
 * How a payment method behaves, which decides when money is recognised.
 *
 * The distinction is not cosmetic: cash on delivery is a promise until the
 * courier hands the cash over, while a manual bKash transfer is money the
 * shop already has. Posting both the same way overstates cash on hand by
 * every undelivered parcel on the road.
 */
enum PaymentMethodType: string
{
    /**
     * Collected by the courier on delivery. Recognised as COD Receivable when
     * the order is delivered, and as cash only when the courier settles.
     */
    case CashOnDelivery = 'cod';

    /**
     * The customer sends money themselves -- bKash, Nagad, bank transfer --
     * and someone at the shop confirms it against a reference number.
     */
    case Manual = 'manual';

    /** Cash handed over in person. */
    case Cash = 'cash';

    /**
     * An online gateway. Money lands in a clearing account first, because the
     * gateway holds it for days and takes a fee out of the middle.
     */
    case Gateway = 'gateway';

    public function label(): string
    {
        return match ($this) {
            self::CashOnDelivery => 'Cash on delivery',
            self::Manual => 'Manual transfer',
            self::Cash => 'Cash',
            self::Gateway => 'Online payment',
        };
    }

    /** Is the money only real once the parcel arrives? */
    public function isCollectedOnDelivery(): bool
    {
        return $this === self::CashOnDelivery;
    }

    /**
     * Does the customer end up holding a transaction id for this?
     *
     * A manual transfer is the whole reason the field exists: the customer
     * sends the money from their own wallet and the only proof either side
     * has, until the statement is read, is the id bKash gave them. Cash and
     * COD produce no such number, and a gateway produces one the shop is
     * told directly -- asking the customer to copy it out would be asking
     * them to retype something the shop already knows better.
     */
    public function collectsReference(): bool
    {
        return $this === self::Manual;
    }

    /**
     * Where money LANDS when this method is used.
     *
     * Strictly the destination, never the debt it settles. The two are easy
     * to confuse on cash on delivery, and confusing them is silent: COD
     * settles the COD Receivable balance, so naming that account here posts
     * `Dr COD Receivable / Cr COD Receivable` -- an entry that balances
     * perfectly, moves no money, and leaves the receivable outstanding
     * forever. The cash the courier hands over goes in the cash box.
     *
     * A default only: each payment method row names its own account, which is
     * what makes "bKash personal" and "bKash merchant" separable in reports.
     */
    public function defaultAccountKey(): string
    {
        return match ($this) {
            self::CashOnDelivery, self::Cash => 'cash_in_hand',
            self::Manual => 'bank_default',
            self::Gateway => 'gateway_clearing',
        };
    }
}
