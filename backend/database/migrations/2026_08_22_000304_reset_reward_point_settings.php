<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Clears out whatever placeholder values were stored under the 'rewards'
 * settings group before the reward points feature existed to let an admin
 * actually see or change them. Once cleared, SettingsService falls back to
 * the current (renamed, re-tuned) defaults in config/upokoron.php until an
 * admin saves the rewards settings screen for real.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::table('settings')->where('group', 'rewards')->delete();
    }

    public function down(): void
    {
        // Nothing to restore -- these were placeholder values, not data an
        // admin configured on purpose.
    }
};
