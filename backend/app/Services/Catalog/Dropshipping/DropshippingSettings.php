<?php

declare(strict_types=1);

namespace App\Services\Catalog\Dropshipping;

use App\Services\Support\SettingsService;
use Illuminate\Contracts\Encryption\DecryptException;
use Illuminate\Support\Facades\Crypt;

/**
 * Connection and sync settings for the DropShipping.com.bd reseller panel.
 *
 * Kept as one JSON setting. The panel password is stored encrypted and is
 * never sent back to the browser; the admin screen can only replace it.
 */
class DropshippingSettings
{
    public const KEY = 'dropshipping_bd';

    /** Gadgets & Electronics on the panel. */
    public const DEFAULT_SOURCES = 'category_id=15';

    public function __construct(private readonly SettingsService $settings) {}

    /** @return array<string, mixed> */
    public function defaults(): array
    {
        return [
            'base_url' => 'https://www.dropshipping.com.bd',
            'phone' => '',
            'password' => '', // Encrypted.
            'sources' => self::DEFAULT_SOURCES,
            'auto_sync' => false,
            'interval_hours' => 3,
            'import_new' => true,
            'new_status' => 'draft',
            'price_field' => 'reselling_price',
            'compare_at_from_regular' => true,
            'hide_out_of_stock' => true,
            'max_images' => 5,
            'request_delay_ms' => 250,
            'site_code' => '01',
        ];
    }

    /** @return array<string, mixed> */
    public function all(): array
    {
        $stored = $this->settings->get(self::KEY, []);
        if (is_string($stored)) {
            $stored = json_decode($stored, true) ?: [];
        }

        return array_merge($this->defaults(), is_array($stored) ? $stored : []);
    }

    public function get(string $key): mixed
    {
        return $this->all()[$key] ?? null;
    }

    public function password(): string
    {
        $value = (string) $this->get('password');
        if ($value === '') {
            return '';
        }

        try {
            return Crypt::decryptString($value);
        } catch (DecryptException) {
            return '';
        }
    }

    public function configured(): bool
    {
        return trim((string) $this->get('phone')) !== '' && $this->password() !== '';
    }

    /** @param array<string, mixed> $values */
    public function save(array $values): void
    {
        $current = $this->all();

        if (array_key_exists('password', $values)) {
            $values['password'] = filled($values['password'])
                ? Crypt::encryptString((string) $values['password'])
                : $current['password'];
        }

        $merged = array_intersect_key(array_merge($current, $values), $this->defaults());
        $this->settings->set(self::KEY, $merged);
    }

    /** What the admin screen may see. */
    public function forDisplay(): array
    {
        $all = $this->all();
        $all['has_password'] = $this->password() !== '';
        unset($all['password']);

        return $all;
    }

    /**
     * Each non-empty line of the Sources box is one panel listing:
     *
     *   category_id=15
     *   category_id=15&sub_category_id=65 => speakers
     *
     * The optional part after "=>" is an Upokoron category slug (or ID) to
     * put that listing's products in. Without it, products go into hidden
     * supplier categories named after the panel's sub-category.
     *
     * @return array<int, array{params: array<string, string>, target: string, label: string}>
     */
    public function sources(): array
    {
        $out = [];
        foreach (preg_split('/\r\n|\r|\n/', (string) $this->get('sources')) ?: [] as $line) {
            $line = trim($line);
            if ($line === '' || str_starts_with($line, '#')) {
                continue;
            }

            $target = '';
            if (str_contains($line, '=>')) {
                [$line, $target] = array_map('trim', explode('=>', $line, 2));
            }
            if (str_contains($line, '?')) {
                $line = substr($line, strpos($line, '?') + 1);
            }

            parse_str($line, $query);
            $params = [];
            foreach (['category_id', 'sub_category_id', 'sub_sub_category_id'] as $field) {
                $value = trim((string) ($query[$field] ?? ''));
                if ($value !== '' && ctype_digit($value)) {
                    $params[$field] = $value;
                }
            }
            if ($params === []) {
                continue;
            }

            $params['category_type'] = isset($params['sub_sub_category_id'])
                ? 'sub_sub_category'
                : (isset($params['sub_category_id']) ? 'sub_category' : 'category');

            $out[] = [
                'params' => $params,
                'target' => $target,
                'label' => $line.($target !== '' ? ' => '.$target : ''),
            ];
        }

        return $out;
    }
}
