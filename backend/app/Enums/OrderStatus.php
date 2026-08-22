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

    /**
     * Parked, on purpose.
     *
     * The customer will not pick up, the address is unclear, or a line is
     * short. The order keeps its stock hold while it waits -- a paused order
     * that released its stock could be oversold to somebody else, and then
     * resuming it would be a promise the shelf cannot keep.
     */
    case OnHold = 'on_hold';

    /** The shop has accepted it. Usually after a confirmation phone call. */
    case Confirmed = 'confirmed';

    /** Being picked from the shelf. Still the shop's stock, nothing posted. */
    case Processing = 'processing';

    /** Picked and boxed, still on the premises. */
    case Packed = 'packed';

    /**
     * Boxed, labelled, waiting for the courier to collect.
     *
     * Still on the premises, so it is still the shop's stock and can still
     * be called off. The distinction from Packed is whose desk it is on:
     * Packed is the packer's work finished, ReadyToShip is the pickup queue.
     */
    case ReadyToShip = 'ready_to_ship';

    /**
     * Handed to the courier. Stock has physically left, so it moves out of
     * Inventory and into Goods in Transit -- at cost, not as a sale. Nothing
     * is revenue yet.
     */
    case Shipped = 'shipped';

    /**
     * On the van, out for the last mile.
     *
     * Accounting-wise this is indistinguishable from Shipped -- the goods
     * left at Shipped and Goods in Transit was posted then. It exists so the
     * board can tell "with the courier" from "arriving today", which is the
     * difference between a parcel to chase tomorrow and one to chase now.
     */
    case OutForDelivery = 'out_for_delivery';

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
            self::OnHold => 'On hold',
            self::Confirmed => 'Confirmed',
            self::Processing => 'Processing',
            self::Packed => 'Packed',
            self::ReadyToShip => 'Ready to ship',
            self::Shipped => 'Shipped',
            self::OutForDelivery => 'Out for delivery',
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
            self::Pending => [self::Confirmed, self::OnHold, self::Cancelled],

            // Resuming lands on Confirmed rather than back where it came
            // from. An order is held because something needed sorting out;
            // whoever sorted it has, by then, spoken to the customer, which
            // is exactly what Confirmed means.
            self::OnHold => [self::Confirmed, self::Cancelled],

            self::Confirmed => [self::Processing, self::OnHold, self::Cancelled],
            self::Processing => [self::Packed, self::Cancelled],
            self::Packed => [self::ReadyToShip, self::Cancelled],

            // The last point at which calling it off is just paperwork.
            self::ReadyToShip => [self::Shipped, self::Cancelled],

            // Once it is with the courier it either arrives or comes back.
            // Cancelling is not one of the options: the goods are out.
            self::Shipped => [self::OutForDelivery, self::Delivered, self::Returned],
            self::OutForDelivery => [self::Delivered, self::Returned],

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
        return in_array(
            $this,
            [self::Shipped, self::OutForDelivery, self::Delivered, self::Returned],
            true,
        );
    }

    /** Nothing further will happen to this order. */
    public function isFinal(): bool
    {
        return $this->allowedNext() === [];
    }

    /** Still holding stock that nobody else can buy. */
    public function holdsStock(): bool
    {
        return in_array(
            $this,
            [
                self::Pending,
                self::OnHold,
                self::Confirmed,
                self::Processing,
                self::Packed,
                self::ReadyToShip,
            ],
            true,
        );
    }

    /**
     * Somebody still has to do something about it.
     *
     * Everything that is neither finished nor abandoned -- the working set
     * the dashboard calls the pipeline and the orders list calls open.
     *
     * @return array<int, self>
     */
    public static function inFlight(): array
    {
        return array_values(array_filter(
            self::cases(),
            static fn (self $status): bool => ! $status->isFinal(),
        ));
    }

    /**
     * @return array<int, string>
     */
    public static function values(): array
    {
        return array_map(static fn (self $case): string => $case->value, self::cases());
    }
}
