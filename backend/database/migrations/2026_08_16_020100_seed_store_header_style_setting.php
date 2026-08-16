<?php

declare(strict_types=1);

use App\Enums\SettingType;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Same reasoning as the store_favicon and store_support_hours migrations:
 * routine deploys run migrate, not db:seed, so a config-only addition never
 * reaches the settings table (and therefore never reaches the public
 * settings endpoint, which reads is_public from that table).
 */
return new class extends Migration
{
    public function up(): void
    {
        if (DB::table('settings')->where('key', 'store_header_style')->exists()) {
            return;
        }

        DB::table('settings')->insert([
            'key' => 'store_header_style',
            'group' => 'store',
            'value' => SettingType::String->serialize('categories'),
            'type' => SettingType::String->value,
            'is_public' => true,
            'label' => 'Store Header Style',
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    public function down(): void
    {
        DB::table('settings')->where('key', 'store_header_style')->delete();
    }
};
