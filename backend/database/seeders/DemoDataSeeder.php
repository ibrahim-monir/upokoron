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
                ['Kitchen', ['Cookware', 'Storage']],
                ['Home care', ['Cleaning', 'Laundry']],
                ['Personal care', []],
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

        $brands = collect(['Pran', 'Square', 'ACI', 'Kohinoor'])
            ->mapWithKeys(fn (string $name) => [
                $name => Brand::firstOrCreate(['name' => $name], ['is_active' => true]),
            ]);

        // A variant attribute, so at least one product exercises the
        // cartesian generator and multi-variation inventory.
        $size = Attribute::firstOrCreate(
            ['name' => 'Size'],
            ['type' => 'select', 'is_variant' => true, 'is_active' => true],
        );

        $sizes = collect(['500 ml', '1 litre', '2 litre'])
            ->map(fn (string $value) => $size->values()->firstOrCreate(['value' => $value]));

        $catalogue = [
            ['Non-stick Frying Pan 24cm', 'Cookware', 'Kohinoor', '1450.00', '1800.00', '40', '980.00'],
            ['Pressure Cooker 5L', 'Cookware', 'Kohinoor', '3200.00', null, '18', '2400.00'],
            ['Airtight Storage Jar Set', 'Storage', 'Square', '890.00', '1150.00', '65', '540.00'],
            ['Stainless Steel Tiffin Box', 'Storage', 'Square', '620.00', null, '90', '390.00'],
            ['Floor Cleaner Concentrate', 'Cleaning', 'ACI', '245.00', null, '150', '160.00'],
            ['Dishwashing Liquid', 'Cleaning', 'ACI', '180.00', '210.00', '210', '112.00'],
            ['Detergent Powder 1kg', 'Laundry', 'Pran', '320.00', null, '120', '215.00'],
            ['Antiseptic Handwash', 'Personal care', 'ACI', '165.00', null, '175', '104.00'],
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
                'short_description' => 'Everyday '.strtolower($category).' for the home.',
                'description' => "{$name} from {$brand}. Sourced directly and stocked in Dhaka.",
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

        // One variable product, to exercise variation generation.
        $cookingOil = $products->create([
            'name' => 'Soyabean Cooking Oil',
            'category_id' => $categories['Kitchen']->id,
            'brand_id' => $brands['Pran']->id,
            'unit_id' => $piece,
            'type' => 'variable',
            'status' => 'active',
            'short_description' => 'Refined soyabean oil in three bottle sizes.',
            'selling_price' => '190.00',
            'attributes' => [$size->id => $sizes->pluck('id')->all()],
        ]);

        foreach ($cookingOil->variations as $index => $variation) {
            $inventory->openingStock($variation, (string) (80 - $index * 20), (string) ((80 - $index * 20) * 128), 'Demo opening stock');
        }

        $created++;

        $this->command?->info("  demo products: {$created}");
        $this->command?->info('  stock value: '.DB::table('inventories')->sum('stock_value'));
    }
}
