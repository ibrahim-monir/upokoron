<?php

declare(strict_types=1);

namespace Database\Seeders;

use Illuminate\Database\Seeder;

/**
 * Baseline data every installation needs. Every seeder here is idempotent,
 * so `db:seed` is safe to run against an existing database after a deploy.
 */
class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        $this->call([
            RolePermissionSeeder::class,
            SettingsSeeder::class,
            OwnerSeeder::class,

            // Accounting must exist before anything can post: inventory,
            // purchases, and orders all write to the ledger.
            AccountTypeSeeder::class,
            ChartOfAccountsSeeder::class,
            FiscalYearSeeder::class,

            // Catalog reference data.
            UnitSeeder::class,

            // Delivery zones. Seeded rather than left empty because a shop
            // with no fallback zone cannot quote delivery to an unlisted
            // district, and the customer simply cannot check out.
            ShippingZoneSeeder::class,
        ]);
    }
}
