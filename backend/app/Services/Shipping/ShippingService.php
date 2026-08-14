<?php

declare(strict_types=1);

namespace App\Services\Shipping;

use App\Exceptions\BusinessRuleException;
use App\Models\ShippingRate;
use App\Models\ShippingZone;
use App\Models\ShippingZoneArea;
use App\Support\Districts;
use App\Support\Money;
use App\Support\Quantity;

/**
 * Where we deliver, and what it costs.
 *
 * Two rules carry the whole thing:
 *
 *   1. The most specific match wins. A row naming a city beats one naming
 *      only the district, so "Dhaka city" can be ৳60 while the rest of Dhaka
 *      district is ৳120, without listing every other town in it.
 *
 *   2. Something always matches. One zone is marked as the fallback and
 *      catches every address nobody thought to list. Without it, a customer
 *      in an unlisted district gets no quote, cannot check out, and the sale
 *      disappears without leaving a trace anywhere for anyone to notice.
 */
class ShippingService
{
    /**
     * The zone that covers an address.
     */
    public function zoneFor(string $district, ?string $city = null): ShippingZone
    {
        /*
         * Normalised to the official spelling first.
         *
         * Half the country still writes Jessore and Comilla, and a zone
         * listing Jashore would not match either. The failure is silent and
         * expensive: the address falls through to the fallback zone and the
         * customer is quoted the most distant delivery charge.
         */
        $district = Districts::normalise($district) ?? trim($district);
        $city = $city === null ? null : trim($city);

        /*
         * One query, and the ORDER BY is the "most specific wins" rule
         * itself: rows naming a city sort before rows that name only the
         * district. Deciding it here rather than in the callers keeps it a
         * single rule instead of a sort that has to be remembered in three
         * places.
         */
        $area = ShippingZoneArea::query()
            ->whereRaw('LOWER(district) = ?', [mb_strtolower($district)])
            ->where(function ($q) use ($city): void {
                $q->whereNull('city');

                if ($city !== null && $city !== '') {
                    $q->orWhereRaw('LOWER(city) = ?', [mb_strtolower($city)]);
                }
            })
            ->whereHas('zone', fn ($zone) => $zone->where('is_active', true))
            ->orderByRaw('CASE WHEN city IS NULL THEN 1 ELSE 0 END')
            ->with('zone')
            ->first();

        return $area?->zone ?? $this->fallbackZone();
    }

    /**
     * The catch-all zone.
     */
    public function fallbackZone(): ShippingZone
    {
        $zone = ShippingZone::query()->active()->where('is_fallback', true)->first();

        if ($zone === null) {
            throw new BusinessRuleException(
                'No delivery area covers that address, and no default has been set up.',
                'no_shipping_zone',
            );
        }

        return $zone;
    }

    /**
     * The delivery options for a basket going to a zone.
     *
     * @return array<int, array<string, mixed>>
     */
    public function quote(
        ShippingZone $zone,
        Money $subtotal,
        ?Quantity $weightKg = null,
        bool $requiresCod = false,
    ): array {
        $rates = $zone->rates()->active()->get();

        if ($requiresCod) {
            // A courier that will not collect cash in this zone makes COD
            // impossible there, whatever the shop's payment settings say.
            $rates = $rates->filter(fn (ShippingRate $rate): bool => $rate->supports_cod)->values();
        }

        return $rates->map(function (ShippingRate $rate) use ($subtotal, $weightKg): array {
            $charge = $rate->chargeFor($subtotal, $weightKg);

            return [
                'id' => $rate->id,
                'zone_id' => $rate->shipping_zone_id,
                'name' => $rate->name,
                'description' => $rate->description,
                'charge' => $charge->value(),
                'is_free' => $charge->isZero(),
                'free_above_subtotal' => $rate->free_above_subtotal === null
                    ? null
                    : Money::of($rate->free_above_subtotal)->value(),
                'estimate' => $rate->estimateLabel(),
                'supports_cod' => $rate->supports_cod,
            ];
        })->all();
    }

    /**
     * Re-price a chosen delivery option.
     *
     * Checkout calls this instead of trusting the charge the browser sends
     * back with the order -- the quote above is for display, this is the
     * number the customer is actually charged.
     */
    public function chargeForRate(
        ShippingRate $rate,
        Money $subtotal,
        ?Quantity $weightKg = null,
        bool $requiresCod = false,
    ): Money {
        if (! $rate->is_active || ! $rate->zone?->is_active) {
            throw new BusinessRuleException(
                'That delivery option is no longer available.',
                'shipping_rate_unavailable',
                ['shipping_rate_id' => $rate->id],
            );
        }

        if ($requiresCod && ! $rate->supports_cod) {
            throw new BusinessRuleException(
                'Cash on delivery is not available for that delivery option.',
                'cod_not_supported',
                ['shipping_rate_id' => $rate->id],
            );
        }

        return $rate->chargeFor($subtotal, $weightKg);
    }
}
