<?php

declare(strict_types=1);

namespace App\Enums;

/**
 * Where an order is in its life, and what may happen to it next.
 *
 * The transitions live here rather than being checked at each call site,
 * because an order that can be delivered twice posts revenue twice, and the
 * books then disagree with reality in a way no report will explain.
 *
 * Shaped around cash on delivery, which is how most of this shop's orders
 * will be paid. That has two consequences the flow has to carry:
 *
 *   - Money is only real at DELIVERED. A shipped COD parcel is stock that has
 *     left the building and may come straight back.
 *   - Return to origin is normal, not exceptional. `Returned` is reachable
 *     from `Shipped` as a first-class step, not an error path.
 */
enum OrderStatus: string
{
    /** Placed. Stock is held, nothing has moved, nothing is posted. */
    case Pending = 'pending';

    /** The shop has accepted it. Usually after a confirmation phone call. */
    case Confirmed = 'confirmed';

    /** Picked and boxed, still on the premises. */
    case Packed = 'packed';

    /**
     * Handed to the courier. Stock has physically left, so it moves out of
     * Inventory and into Goods in Transit -- at cost, not as a sale. Nothing
     * is revenue yet.
     */
    case Shipped = 'shipped';

    /** The customer has it. This is where revenue and COGS are recognised. */
    case Delivered = 'delivered';

    /** Called off before it shipped. Stock goes back, nothing was posted. */
    case Cancelled = 'cancelled';

    /**
     * Came back undelivered. The Goods in Transit entry is reversed and the
     * stock returns at the same cost it left with.
     */
    case Returned = 'returned';

    public function label(): string
    {
        return match ($this) {
            self::Pending => 'Pending',
            self::Confirmed => 'Confirmed',
            self::Packed => 'Packed',
            self::Shipped => 'Shipped',
            self::Delivered => 'Delivered',
            self::Cancelled => 'Cancelled',
            self::Returned => 'Returned (RTO)',
        };
    }

    /**
     * @return array<int, self>
     */
    public function allowedNext(): array
    {
        return match ($this) {
            self::Pending => [self::Confirmed, self::Cancelled],
            self::Confirmed => [self::Packed, self::Cancelled],
            self::Packed => [self::Shipped, self::Cancelled],

            // Once it is with the courier it either arrives or comes back.
            // Cancelling is not one of the options: the goods are out.
            self::Shipped => [self::Delivered, self::Returned],

            // Terminal. A delivered order that comes back later is a sales
            // return against the posted revenue, which is its own document
            // with its own refund -- not a status change that would quietly
            // unwind an entry the books have already reported on.
            self::Delivered, self::Cancelled, self::Returned => [],
        };
    }

    public function canMoveTo(self $next): bool
    {
        return in_array($next, $this->allowedNext(), true);
    }

    /** Stock has left the building. */
    public function hasShipped(): bool
    {
        return in_array($this, [self::Shipped, self::Delivered, self::Returned], true);
    }

    /** Nothing further will happen to this order. */
    public function isFinal(): bool
    {
        return $this->allowedNext() === [];
    }

    /** Still holding stock that nobody else can buy. */
    public function holdsStock(): bool
    {
        return in_array($this, [self::Pending, self::Confirmed, self::Packed], true);
    }

    /**
     * @return array<int, string>
     */
    public static function values(): array
    {
        return array_map(static fn (self $case): string => $case->value, self::cases());
    }
}
