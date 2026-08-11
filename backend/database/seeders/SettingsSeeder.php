<?php

declare(strict_types=1);

namespace Database\Seeders;

use App\Enums\SettingType;
use App\Models\Setting;
use App\Services\Support\SettingsService;
use Illuminate\Database\Seeder;

/**
 * Writes the config defaults into the settings table so the admin settings
 * screen has rows to render. Existing values are never overwritten -- re-running
 * this must not reset a store owner's configuration.
 */
class SettingsSeeder extends Seeder
{
    public function run(): void
    {
        $this->assertKeysAreUnique();

        $existing = Setting::pluck('key')->all();
        $created = 0;

        foreach (config('upokoron.settings', []) as $group => $keys) {
            foreach ($keys as $key => $default) {
                if (in_array($key, $existing, true)) {
                    continue;
                }

                $type = SettingType::infer($default);

                Setting::create([
                    'key' => $key,
                    'group' => $group,
                    'value' => $type->serialize($default),
                    'type' => $type,
                    // Store identity is needed by the storefront before login.
                    'is_public' => $group === 'store',
                    'label' => str($key)->replace('_', ' ')->title()->value(),
                ]);

                $created++;
            }
        }

        app(SettingsService::class)->flush();

        $this->command?->info("  settings seeded: {$created} new");
    }

    /**
     * Setting keys are unique across the whole table, so the same key declared
     * under two config groups is a programming error. Catch it here with a
     * readable message rather than as a duplicate-key SQL failure halfway
     * through a deploy.
     */
    private function assertKeysAreUnique(): void
    {
        $seen = [];
        $duplicates = [];

        foreach (config('upokoron.settings', []) as $group => $keys) {
            foreach (array_keys($keys) as $key) {
                if (isset($seen[$key])) {
                    $duplicates[] = "{$key} (in both '{$seen[$key]}' and '{$group}')";
                }

                $seen[$key] = $group;
            }
        }

        if ($duplicates !== []) {
            throw new \LogicException(
                'Duplicate setting keys in config/upokoron.php: '.implode(', ', $duplicates)
            );
        }
    }
}
