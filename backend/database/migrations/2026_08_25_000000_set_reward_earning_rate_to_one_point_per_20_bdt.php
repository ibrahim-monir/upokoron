<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

/**
 * A deliberate policy change: 1 point per BDT 20 spent, not per BDT 100.
 *
 * config/upokoron.php's default moved with it, but SettingsService reads the
 * database first and only falls back to config for a key with no row at
 * all -- an install where 'points_per_hundred' was ever seeded or saved
 * (most of them) would keep earning at the old rate forever otherwise. This
 * corrects whatever is stored today; if no row exists (e.g. a fresh install,
 * or one where the settings reset migration already ran and nothing has
 * saved the rewards screen since), the update is a harmless no-op and the
 * new config default already applies.
 *
 * SettingsService also caches every setting for an hour (self::CACHE_KEY
 * there, matched literally here rather than imported -- a migration reaching
 * into an application service is the wrong direction). Without clearing it,
 * whichever value a request happened to warm the cache with before this
 * migration ran would keep being served for up to an hour after a deploy
 * that was specifically about changing it right now.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::table('settings')->where('key', 'points_per_hundred')->update(['value' => '1']);

        Cache::forget('upokoron.settings');
    }

    public function down(): void
    {
        DB::table('settings')->where('key', 'points_per_hundred')->update(['value' => '5']);

        Cache::forget('upokoron.settings');
    }
};
