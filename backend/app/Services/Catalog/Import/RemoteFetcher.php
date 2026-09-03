<?php

declare(strict_types=1);

namespace App\Services\Catalog\Import;

use App\Exceptions\BusinessRuleException;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;

/**
 * Fetching a URL an admin typed.
 *
 * Everywhere else in this application the server decides who it talks to.
 * Here a person does, and that inverts the trust: the request leaves from
 * inside the network, so "https://anything" is an invitation to read
 * http://127.0.0.1:3306, http://192.168.0.1/admin, or -- on almost every
 * cloud host -- http://169.254.169.254/, which hands out the machine's own
 * credentials. That class of bug is SSRF, and it is the reason this class
 * exists instead of a bare Http::get().
 *
 * The guard has to run on every hop, not just the first: a public host is
 * free to answer 302 with a private address, and Guzzle would follow it
 * without asking. So redirects are turned off and walked by hand.
 */
class RemoteFetcher
{
    /**
     * Fetch a URL and return [body, mime, final url].
     *
     * @return array{body: string, mime: string, url: string}
     */
    public function get(string $url, string $accept = 'text/html,application/xhtml+xml'): array
    {
        $maxRedirects = (int) config('upokoron.import.max_redirects', 3);
        $maxBytes = (int) config('upokoron.import.max_bytes', 2097152);

        for ($hop = 0; $hop <= $maxRedirects; $hop++) {
            $this->assertSafe($url);

            try {
                $response = Http::withHeaders([
                    'User-Agent' => (string) config('upokoron.import.user_agent'),
                    'Accept' => $accept,
                ])
                    ->timeout((int) config('upokoron.import.timeout', 10))
                    ->connectTimeout((int) config('upokoron.import.connect_timeout', 5))
                    ->withOptions(['allow_redirects' => false])
                    ->get($url);
            } catch (ConnectionException $e) {
                throw new BusinessRuleException(
                    'Could not reach that page: '.$e->getMessage(),
                    'import_unreachable',
                    ['url' => $url],
                    422,
                );
            }

            if ($response->redirect()) {
                $location = $response->header('Location');

                if ($location === '') {
                    throw new BusinessRuleException(
                        'That page redirected without saying where to.',
                        'import_bad_redirect',
                        ['url' => $url],
                        422,
                    );
                }

                // A relative Location is legal and common.
                $url = $this->resolveUrl($url, $location);

                continue;
            }

            if (! $response->successful()) {
                throw new BusinessRuleException(
                    "That page answered {$response->status()}. Check the address, or the site may be blocking us.",
                    'import_http_error',
                    ['url' => $url, 'status' => $response->status()],
                    422,
                );
            }

            $body = $response->body();

            // Content-Length is a hint, not a promise, so the real length is
            // what decides -- but honouring the header when it is there saves
            // reading a 900 MB "product page" into memory first.
            if (strlen($body) > $maxBytes) {
                throw new BusinessRuleException(
                    'That page is too large to read ('.round(strlen($body) / 1048576, 1).' MB).',
                    'import_too_large',
                    ['url' => $url, 'max_bytes' => $maxBytes],
                    422,
                );
            }

            return [
                'body' => $body,
                'mime' => strtolower(trim(explode(';', (string) $response->header('Content-Type'))[0])),
                'url' => $url,
            ];
        }

        throw new BusinessRuleException(
            'That address redirected too many times.',
            'import_redirect_loop',
            ['url' => $url],
            422,
        );
    }

    /**
     * Reject anything that is not a plain public web address.
     *
     * Split out and public so the image importer runs the same test on the
     * picture URLs it finds inside a page -- those are attacker-controlled in
     * exactly the same way the page address is.
     */
    public function assertSafe(string $url): void
    {
        $parts = parse_url($url);

        if ($parts === false || ! isset($parts['scheme'], $parts['host'])) {
            throw $this->refuse($url, 'That is not a complete web address.');
        }

        if (! in_array(strtolower($parts['scheme']), ['http', 'https'], true)) {
            throw $this->refuse($url, 'Only http and https addresses can be imported.');
        }

        // user:pass@host is how a crafted URL smuggles one host past a reader
        // that stops at the "@".
        if (isset($parts['user']) || isset($parts['pass'])) {
            throw $this->refuse($url, 'Addresses with a username or password in them are not imported.');
        }

        if (isset($parts['port']) && ! in_array((int) $parts['port'], [80, 443, 8080, 8443], true)) {
            throw $this->refuse($url, 'Only the usual web ports (80, 443, 8080, 8443) can be imported.');
        }

        if (! config('upokoron.import.block_private_hosts', true)) {
            return;
        }

        foreach ($this->addressesFor($parts['host']) as $ip) {
            if (! $this->isPublic($ip)) {
                throw $this->refuse(
                    $url,
                    'That address points inside this server\'s own network, so it is not imported.',
                );
            }
        }
    }

    /**
     * Every IP a hostname resolves to.
     *
     * All of them, not the first: a host that answers with one public and one
     * loopback address would otherwise pass the check and then be connected
     * to on the loopback one.
     *
     * @return array<int, string>
     */
    private function addressesFor(string $host): array
    {
        $host = trim($host, '[]');

        if (filter_var($host, FILTER_VALIDATE_IP)) {
            return [$host];
        }

        $records = @dns_get_record($host, DNS_A + DNS_AAAA) ?: [];

        $ips = array_values(array_filter(array_map(
            static fn (array $record): ?string => $record['ip'] ?? $record['ipv6'] ?? null,
            $records,
        )));

        if ($ips === []) {
            throw $this->refuse($host, 'That hostname does not resolve to anything.');
        }

        return $ips;
    }

    /** Public means routable on the internet: not private, not reserved, not loopback. */
    private function isPublic(string $ip): bool
    {
        return filter_var(
            $ip,
            FILTER_VALIDATE_IP,
            FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE,
        ) !== false;
    }

    /** Absolute, protocol-relative, root-relative, or relative -- all four occur in the wild. */
    public function resolveUrl(string $base, string $relative): string
    {
        $relative = trim($relative);

        if ($relative === '') {
            return $base;
        }

        if (str_starts_with($relative, '//')) {
            return (parse_url($base, PHP_URL_SCHEME) ?: 'https').':'.$relative;
        }

        if (preg_match('#^[a-z][a-z0-9+.-]*://#i', $relative) === 1) {
            return $relative;
        }

        $parts = parse_url($base);

        if (! isset($parts['scheme'], $parts['host'])) {
            return $relative;
        }

        $origin = $parts['scheme'].'://'.$parts['host'].(isset($parts['port']) ? ':'.$parts['port'] : '');

        if (str_starts_with($relative, '/')) {
            return $origin.$relative;
        }

        $directory = rtrim(dirname($parts['path'] ?? '/'), '/');

        return $origin.$directory.'/'.$relative;
    }

    private function refuse(string $url, string $message): BusinessRuleException
    {
        return new BusinessRuleException($message, 'import_url_refused', ['url' => $url], 422);
    }
}
