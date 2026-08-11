<?php

declare(strict_types=1);

namespace Database\Seeders;

use App\Models\Unit;
use Illuminate\Database\Seeder;

class UnitSeeder extends Seeder
{
    public function run(): void
    {
        $units = [
            // name, short, allows fractional quantities
            ['Piece', 'pc', false],
            ['Pack', 'pack', false],
            ['Box', 'box', false],
            ['Dozen', 'dzn', false],
            ['Set', 'set', false],
            ['Pair', 'pair', false],
            ['Kilogram', 'kg', true],
            ['Gram', 'g', true],
            ['Litre', 'L', true],
            ['Millilitre', 'ml', true],
            ['Metre', 'm', true],
            ['Foot', 'ft', true],
        ];

        foreach ($units as [$name, $short, $decimal]) {
            Unit::updateOrCreate(
                ['name' => $name],
                ['short_name' => $short, 'allow_decimal' => $decimal, 'is_active' => true],
            );
        }

        $this->command?->info('  units: '.count($units));
    }
}
