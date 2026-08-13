<?php

declare(strict_types=1);

namespace Database\Seeders;

use App\Models\Attribute;
use App\Models\Brand;
use App\Models\Category;
use App\Models\Unit;
use App\Services\Catalog\ProductService;
use App\Services\Inventory\InventoryService;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

/**
 * Sample catalogue for local development.
 *
 * DELIBERATELY NOT in DatabaseSeeder -- run it by name:
 *
 *     php artisan db:seed --class=DemoDataSeeder
 *
 * It creates real products through ProductService and real stock through
 * InventoryService, so the ledger, the costing, and the invariants are all
 * exercised by it. Nothing here is mock data pretending to be a feature.
 */
class DemoDataSeeder extends Seeder
{
    public function run(): void
    {
        $products = app(ProductService::class);
        $inventory = app(InventoryService::class);

        $piece = Unit::firstWhere('name', 'Piece')?->id;

        $categories = [];

        foreach (
            [
                ['Audio', ['Earbuds', 'Speakers']],
                ['Power & Charging', ['Power Banks', 'Chargers & Cables']],
                ['Computer Accessories', []],
                ['Wearables', []],
            ] as [$parentName, $children]
        ) {
            $parent = Category::firstOrCreate(['name' => $parentName], ['is_active' => true, 'depth' => 0]);
            $categories[$parentName] = $parent;

            foreach ($children as $childName) {
                $categories[$childName] = Category::firstOrCreate(
                    ['name' => $childName],
                    ['parent_id' => $parent->id, 'depth' => 1, 'is_active' => true],
                );
            }
        }

        $brands = collect(['Anker', 'Baseus', 'Havit', 'Xiaomi', 'Logitech'])
            ->mapWithKeys(fn (string $name) => [
                $name => Brand::firstOrCreate(['name' => $name], ['is_active' => true]),
            ]);

        // A variant attribute, so at least one product exercises the
        // cartesian generator and multi-variation inventory.
        $colour = Attribute::firstOrCreate(
            ['name' => 'Colour'],
            ['type' => 'color', 'is_variant' => true, 'is_active' => true],
        );

        $colours = collect([['Black', '#111827'], ['White', '#f8fafc'], ['Navy', '#1b317a']])
            ->map(fn (array $pair) => $colour->values()->firstOrCreate(
                ['value' => $pair[0]],
                ['color_hex' => $pair[1]],
            ));

        // name, category, brand, sell, compare-at, qty, unit cost
        $catalogue = [
            ['Wireless Earbuds Pro', 'Earbuds', 'Anker', '3450.00', '4200.00', '60', '2380.00'],
            ['Noise Cancelling Headphones', 'Earbuds', 'Havit', '5900.00', null, '25', '4100.00'],
            ['Portable Bluetooth Speaker', 'Speakers', 'Xiaomi', '2750.00', '3400.00', '48', '1890.00'],
            ['Soundbar 2.1 Channel', 'Speakers', 'Havit', '8900.00', null, '12', '6400.00'],
            ['20000mAh Power Bank', 'Power Banks', 'Anker', '3200.00', '3850.00', '75', '2210.00'],
            ['10000mAh Slim Power Bank', 'Power Banks', 'Baseus', '1850.00', null, '110', '1240.00'],
            ['65W GaN Fast Charger', 'Chargers & Cables', 'Baseus', '2450.00', '2900.00', '90', '1620.00'],
            ['USB-C Braided Cable 2m', 'Chargers & Cables', 'Baseus', '450.00', '620.00', '320', '265.00'],
            ['Wireless Mouse Silent', 'Computer Accessories', 'Logitech', '1350.00', null, '140', '880.00'],
            ['Mechanical Keyboard TKL', 'Computer Accessories', 'Havit', '4600.00', '5400.00', '35', '3250.00'],
            ['Smart Watch Fitness', 'Wearables', 'Xiaomi', '4200.00', '4900.00', '55', '2950.00'],
        ];

        $created = 0;

        foreach ($catalogue as [$name, $category, $brand, $price, $compareAt, $qty, $unitCost]) {
            $product = $products->create([
                'name' => $name,
                'category_id' => $categories[$category]->id,
                'brand_id' => $brands[$brand]->id,
                'unit_id' => $piece,
                'type' => 'simple',
                'status' => 'active',
                'short_description' => strtolower($category).' from '.$brand.', with warranty.',
                'description' => "{$name} from {$brand}. Genuine stock sourced from the brand's ".
                    'authorised distributor and held in Dhaka. Cash on delivery available.',
                'warranty' => '6 months brand warranty',
                'selling_price' => $price,
                'compare_at_price' => $compareAt,
                'is_stock_tracked' => true,
            ]);

            // Real opening stock: writes a movement AND a journal entry, so
            // the Inventory account moves with it.
            $inventory->openingStock(
                $product->variations()->first(),
                $qty,
                bcmul($qty, $unitCost, 2),
                'Demo opening stock',
            );

            $created++;
        }

        // One variable product, to exercise variation generation and
        // multi-variation inventory.
        $case = $products->create([
            'name' => 'Magnetic Phone Case',
            'category_id' => $categories['Computer Accessories']->id,
            'brand_id' => $brands['Baseus']->id,
            'unit_id' => $piece,
            'type' => 'variable',
            'status' => 'active',
            'short_description' => 'Shock-absorbing case with magnetic mount support.',
            'selling_price' => '890.00',
            'attributes' => [$colour->id => $colours->pluck('id')->all()],
        ]);

        foreach ($case->variations as $index => $variation) {
            $qty = 70 - $index * 15;
            $inventory->openingStock($variation, (string) $qty, (string) ($qty * 560), 'Demo opening stock');
        }

        $created++;

        $this->command?->info("  demo products: {$created}");
        $this->command?->info('  stock value: '.DB::table('inventories')->sum('stock_value'));
    }
}
