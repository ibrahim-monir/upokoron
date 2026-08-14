<?php

declare(strict_types=1);

namespace Database\Seeders;

use App\Models\ShippingRate;
use App\Models\ShippingZone;
use App\Models\ShippingZoneArea;
use Illuminate\Database\Seeder;

/**
 * Delivery zones as a Dhaka-based shop actually runs them.
 *
 * Three zones and one charge each, which is what customers here expect and
 * what couriers price on. Charges are a sensible starting point, not a
 * recommendation -- the owner edits them in the admin panel.
 *
 * Idempotent: re-running updates the areas without duplicating them, so this
 * is safe to include in the deploy seed.
 */
class ShippingZoneSeeder extends Seeder
{
    public function run(): void
    {
        $zones = [
            [
                'name' => 'Inside Dhaka City',
                'slug' => 'inside-dhaka-city',
                'description' => 'Dhaka metropolitan area',
                'is_fallback' => false,
                'position' => 1,
                'areas' => [['district' => 'Dhaka', 'city' => 'Dhaka']],
                'rates' => [[
                    'name' => 'Standard delivery',
                    'base_charge' => '60.00',
                    'free_above_subtotal' => '3000.00',
                    'min_days' => 1,
                    'max_days' => 2,
                ]],
            ],
            [
                'name' => 'Dhaka District (outside the city)',
                'slug' => 'dhaka-district',
                'description' => 'Savar, Keraniganj, Dohar, Nawabganj and the rest of Dhaka district',
                'is_fallback' => false,
                'position' => 2,
                // District-wide, no city: the row above wins for Dhaka city
                // itself, so the rest of the district lands here without
                // naming every town in it.
                'areas' => [['district' => 'Dhaka', 'city' => null]],
                'rates' => [[
                    'name' => 'Standard delivery',
                    'base_charge' => '100.00',
                    'free_above_subtotal' => '5000.00',
                    'min_days' => 2,
                    'max_days' => 3,
                ]],
            ],
            [
                'name' => 'Rest of Bangladesh',
                'slug' => 'rest-of-bangladesh',
                'description' => 'Everywhere else in the country',
                'is_fallback' => true,
                'position' => 3,
                'areas' => [],
                'rates' => [[
                    'name' => 'Standard delivery',
                    'base_charge' => '130.00',
                    'free_above_subtotal' => '5000.00',
                    'min_days' => 3,
                    'max_days' => 5,
                ]],
            ],
        ];

        foreach ($zones as $definition) {
            $zone = ShippingZone::updateOrCreate(
                ['slug' => $definition['slug']],
                [
                    'name' => $definition['name'],
                    'description' => $definition['description'],
                    'is_fallback' => $definition['is_fallback'],
                    'is_active' => true,
                    'position' => $definition['position'],
                ],
            );

            foreach ($definition['areas'] as $area) {
                // Keyed on the place, not the zone: a district can belong to
                // only one zone, and moving it must move the row rather than
                // create a second claim on the same place.
                ShippingZoneArea::updateOrCreate(
                    ['district' => $area['district'], 'city' => $area['city']],
                    ['shipping_zone_id' => $zone->id],
                );
            }

            foreach ($definition['rates'] as $rate) {
                ShippingRate::updateOrCreate(
                    ['shipping_zone_id' => $zone->id, 'name' => $rate['name']],
                    [
                        'base_charge' => $rate['base_charge'],
                        'per_kg_charge' => '0.00',
                        'free_above_subtotal' => $rate['free_above_subtotal'],
                        'min_days' => $rate['min_days'],
                        'max_days' => $rate['max_days'],
                        'supports_cod' => true,
                        'is_active' => true,
                        'position' => 1,
                    ],
                );
            }
        }

        $this->command?->info('shipping zones: '.ShippingZone::count().', areas: '
            .ShippingZoneArea::count().', rates: '.ShippingRate::count());
    }
}
