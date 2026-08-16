<?php

declare(strict_types=1);

use App\Enums\SettingType;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * SettingsSeeder only ever runs once, by hand, during install -- routine
 * deploys run `migrate`, not `db:seed`. A setting added to config after that
 * would otherwise never get a row, and the storefront's public settings
 * endpoint reads from the `settings` table (via `is_public`), not the
 * config default -- so store_favicon would silently never appear there
 * without this.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (DB::table('settings')->where('key', 'store_favicon')->exists()) {
            return;
        }

        DB::table('settings')->insert([
            'key' => 'store_favicon',
            'group' => 'store',
            'value' => SettingType::String->serialize(''),
            'type' => SettingType::String->value,
            'is_public' => true,
            'label' => 'Store Favicon',
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    public function down(): void
    {
        DB::table('settings')->where('key', 'store_favicon')->delete();
    }
};
