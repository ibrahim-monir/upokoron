<?php

declare(strict_types=1);

namespace App\Services\Catalog\Dropshipping;

use GuzzleHttp\Cookie\CookieJar;
use Illuminate\Http\Client\PendingRequest;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\Http;
use RuntimeException;
use Throwable;

/**
 * HTTP client for the DropShipping.com.bd reseller panel.
 *
 * The panel has no API key. It is a Laravel site with a normal login form
 * (phone + password + CSRF token) and the reseller pages read JSON from
 * session-authenticated endpoints. So this logs in like a browser, keeps the
 * session cookies (encrypted, in the cache) and logs in again whenever the
 * panel redirects an API call to the login page.
 *
 *   GET  /login                                   form with _token
 *   POST /login                                   phone, password, _token
 *   GET  /api/reseller/show/product/list          page, item, category_id, sub_category_id,
 *                                                 sub_sub_category_id, category_type, type=all
 *   GET  /api/search/product/{code}               full record incl. product_variant, product_image
 */
class DropshippingClient
{
    private const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

    private const COOKIE_CACHE = 'dropshipping_bd.cookies';

    public const PER_PAGE = 100;

    private ?CookieJar $jar = null;

    private bool $loggedInThisRequest = false;

    public function __construct(private readonly DropshippingSettings $settings) {}

    public function base(): string
    {
        return rtrim((string) $this->settings->get('base_url'), '/');
    }

    /**
     * One page of a panel listing.
     *
     * @param  array<string, string>  $params
     * @return array{items: array<int, array<string, mixed>>, page: int, last_page: int, total: int,
     *               sub_categories: array<int|string, string>, sub_sub_categories: array<int|string, string>}
     */
    public function listPage(array $params, int $page): array
    {
        $json = $this->getJson('/api/reseller/show/product/list', $params + [
            'page' => $page,
            'item' => self::PER_PAGE,
            'type' => 'all',
        ]);

        $products = $json['products'] ?? null;
        if (! is_array($products) || ! isset($products['data']) || ! is_array($products['data'])) {
            throw new RuntimeException('The panel product list did not have the expected shape.');
        }

        $names = function ($rows): array {
            $out = [];
            foreach (is_array($rows) ? $rows : [] as $row) {
                if (isset($row['id'])) {
                    $out[(string) $row['id']] = trim((string) ($row['name'] ?? ''));
                }
            }

            return $out;
        };

        return [
            'items' => array_values(array_filter($products['data'], 'is_array')),
            'page' => (int) ($products['current_page'] ?? $page),
            'last_page' => max(1, (int) ($products['last_page'] ?? 1)),
            'total' => (int) ($products['total'] ?? 0),
            'categories' => $names($json['categories'] ?? []),
            'sub_categories' => $names($json['sub_categories'] ?? []),
            'sub_sub_categories' => $names($json['sub_sub_categories'] ?? []),
        ];
    }

    /**
     * The full record for one product code: variants and gallery included.
     *
     * @return array<string, mixed>|null
     */
    public function product(string $code): ?array
    {
        $json = $this->getJson('/api/search/product/'.rawurlencode($code));

        foreach ((array) ($json['products']['data'] ?? []) as $row) {
            if (is_array($row) && (string) ($row['product_code'] ?? '') === $code) {
                return $row;
            }
        }

        return null;
    }

    /** Public image URL for a storage path the panel returns. */
    public function imageUrl(?string $path): ?string
    {
        $path = trim((string) $path);
        if ($path === '' || $path === 'null') {
            return null;
        }
        if (preg_match('#^https?://#i', $path)) {
            return $path;
        }

        return $this->base().'/public/storage/'.ltrim($path, '/');
    }

    /** Throws with a readable reason when the login does not work. */
    public function login(): void
    {
        if (! $this->settings->configured()) {
            throw new RuntimeException('Add the panel phone number and password first.');
        }

        $this->jar = new CookieJar;

        $form = $this->http()->get($this->base().'/login');
        if (! $form->successful()) {
            throw new RuntimeException("The panel login page answered HTTP {$form->status()}.");
        }

        if (! preg_match('/name="_token"\s+value="([^"]+)"/', $form->body(), $m)) {
            throw new RuntimeException('Could not find the login form on the panel. Its page may have changed.');
        }

        $this->http()
            ->asForm()
            ->withHeaders(['Referer' => $this->base().'/login'])
            ->post($this->base().'/login', [
                '_token' => html_entity_decode($m[1]),
                'phone' => trim((string) $this->settings->get('phone')),
                'password' => $this->settings->password(),
            ]);

        // The form redirects either way, so prove the session works.
        $check = $this->rawGet('/api/reseller/show/product/list', ['page' => 1, 'item' => 1, 'type' => 'all']);
        if (! $this->isJson($check)) {
            $this->forget();
            throw new RuntimeException('The panel did not accept the phone number and password.');
        }

        $this->loggedInThisRequest = true;
        $this->persist();
    }

    public function forget(): void
    {
        $this->jar = new CookieJar;
        Cache::forget(self::COOKIE_CACHE);
    }

    /** @param array<string, mixed> $query
     * @return array<string, mixed>
     */
    private function getJson(string $path, array $query = []): array
    {
        $this->pause();

        $response = $this->rawGet($path, $query);

        if (! $this->isJson($response)) {
            if ($this->loggedInThisRequest && $response->successful()) {
                throw new RuntimeException("The panel returned a page instead of data for {$path}.");
            }
            $this->login();
            $response = $this->rawGet($path, $query);
        }

        if (! $response->successful() || ! $this->isJson($response)) {
            throw new RuntimeException("The panel answered HTTP {$response->status()} for {$path}.");
        }

        $this->persist();

        return (array) $response->json();
    }

    /** @param array<string, mixed> $query */
    private function rawGet(string $path, array $query = []): Response
    {
        return $this->http()
            ->withHeaders(['Accept' => 'application/json', 'X-Requested-With' => 'XMLHttpRequest'])
            ->withOptions(['allow_redirects' => false])
            ->get($this->base().$path, $query);
    }

    private function isJson(Response $response): bool
    {
        if ($response->status() !== 200) {
            return false;
        }

        return str_contains(strtolower((string) $response->header('Content-Type')), 'json')
            && is_array($response->json());
    }

    private function http(): PendingRequest
    {
        return Http::withUserAgent(self::UA)
            ->timeout(40)
            ->connectTimeout(15)
            ->retry(2, 1500, throw: false)
            ->withOptions(['cookies' => $this->jar()]);
    }

    private function jar(): CookieJar
    {
        if ($this->jar !== null) {
            return $this->jar;
        }

        $cookies = [];
        try {
            $stored = Cache::get(self::COOKIE_CACHE);
            if (is_string($stored) && $stored !== '') {
                $cookies = json_decode(Crypt::decryptString($stored), true) ?: [];
            }
        } catch (Throwable) {
            $cookies = [];
        }

        return $this->jar = new CookieJar(false, $cookies);
    }

    private function persist(): void
    {
        if ($this->jar === null) {
            return;
        }

        Cache::put(self::COOKIE_CACHE, Crypt::encryptString((string) json_encode($this->jar->toArray())), now()->addDays(2));
    }

    private function pause(): void
    {
        $ms = (int) $this->settings->get('request_delay_ms');
        if ($ms > 0 && ! app()->runningUnitTests()) {
            usleep(min($ms, 5000) * 1000);
        }
    }
}
