<?php

declare(strict_types=1);

namespace App\Services\Support;

use App\Enums\SettingType;
use App\Models\Setting;
use Illuminate\Support\Facades\Cache;

/**
 * Runtime-editable business settings.
 *
 * Lookup order is database -> config default. A key that has never been saved
 * still resolves, which means a fresh install behaves sensibly before anyone
 * opens the settings screen, and adding a new setting in code does not require
 * a data migration.
 */
class SettingsService
{
    private const CACHE_KEY = 'upokoron.settings';

    private const CACHE_TTL = 3600;

    /** @var array<string, mixed>|null */
    private ?array $loaded = null;

    public function get(string $key, mixed $default = null): mixed
    {
        $settings = $this->all();

        if (array_key_exists($key, $settings)) {
            return $settings[$key];
        }

        return $default ?? $this->configDefault($key);
    }

    public function bool(string $key, bool $default = false): bool
    {
        return filter_var($this->get($key, $default), FILTER_VALIDATE_BOOL);
    }

    public function int(string $key, int $default = 0): int
    {
        return (int) $this->get($key, $default);
    }

    /**
     * Money and rates come back as strings so they can go straight into
     * bcmath without ever passing through a float.
     */
    public function decimal(string $key, string $default = '0.00'): string
    {
        return (string) $this->get($key, $default);
    }

    public function set(string $key, mixed $value): void
    {
        $meta = $this->configMeta($key);
        $type = $meta['type'] ?? SettingType::infer($value);

        Setting::updateOrCreate(
            ['key' => $key],
            [
                'group' => $meta['group'] ?? 'general',
                'value' => $type->serialize($value),
                'type' => $type,
                'is_public' => $meta['is_public'] ?? false,
            ],
        );

        $this->flush();
    }

    /**
     * @param  array<string, mixed>  $values
     */
    public function setMany(array $values): void
    {
        foreach ($values as $key => $value) {
            $this->set($key, $value);
        }
    }

    /**
     * Every setting, database values overlaid on config defaults.
     *
     * @return array<string, mixed>
     */
    public function all(): array
    {
        if ($this->loaded !== null) {
            return $this->loaded;
        }

        $stored = Cache::remember(self::CACHE_KEY, self::CACHE_TTL, function (): array {
            return Setting::all()
                ->mapWithKeys(fn (Setting $s) => [$s->key => $s->typedValue()])
                ->all();
        });

        return $this->loaded = array_merge($this->configDefaults(), $stored);
    }

    /**
     * Settings safe to expose to the storefront without authentication.
     *
     * @return array<string, mixed>
     */
    public function publicSettings(): array
    {
        $publicKeys = Setting::where('is_public', true)->pluck('key')->all();

        return array_intersect_key($this->all(), array_flip($publicKeys));
    }

    /**
     * @return array<string, mixed>
     */
    public function group(string $group): array
    {
        $keys = array_keys(config("upokoron.settings.{$group}", []));

        return array_intersect_key($this->all(), array_flip($keys));
    }

    public function flush(): void
    {
        $this->loaded = null;
        Cache::forget(self::CACHE_KEY);
    }

    /**
     * Flatten the grouped config block into key => default.
     *
     * @return array<string, mixed>
     */
    private function configDefaults(): array
    {
        $flat = [];

        foreach (config('upokoron.settings', []) as $group => $keys) {
            foreach ($keys as $key => $default) {
                $flat[$key] = $default;
            }
        }

        return $flat;
    }

    private function configDefault(string $key): mixed
    {
        return $this->configDefaults()[$key] ?? null;
    }

    /**
     * Group and inferred type for a known config key.
     *
     * @return array{group: string, type: SettingType, is_public: bool}|array{}
     */
    private function configMeta(string $key): array
    {
        foreach (config('upokoron.settings', []) as $group => $keys) {
            if (array_key_exists($key, $keys)) {
                return [
                    'group' => $group,
                    'type' => SettingType::infer($keys[$key]),
                    'is_public' => in_array($group, config('upokoron.public_setting_groups', []), true),
                ];
            }
        }

        return [];
    }
}
