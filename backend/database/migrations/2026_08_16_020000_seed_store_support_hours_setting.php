<?php

declare(strict_types=1);

use App\Enums\SettingType;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Same reasoning as 2026_08_16_000100_seed_store_favicon_setting: routine
 * deploys run migrate, not db:seed, so a config-only addition never reaches
 * the settings table -- and the public settings endpoint reads is_public
 * from that table, not the config default.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (DB::table('settings')->where('key', 'store_support_hours')->exists()) {
            return;
        }

        DB::table('settings')->insert([
            'key' => 'store_support_hours',
            'group' => 'store',
            'value' => SettingType::String->serialize(''),
            'type' => SettingType::String->value,
            'is_public' => true,
            'label' => 'Store Support Hours',
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    public function down(): void
    {
        DB::table('settings')->where('key', 'store_support_hours')->delete();
    }
};
