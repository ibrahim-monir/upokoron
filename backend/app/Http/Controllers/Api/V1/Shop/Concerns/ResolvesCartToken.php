<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1\Shop\Concerns;

use Illuminate\Http\Request;

/**
 * How a basket is identified across requests.
 *
 * Header first, then cookie. The cookie means the web app needs no code at
 * all; the header means a client that cannot hold cookies -- a mobile app
 * later -- can still carry a basket. Shared so the two places that read it
 * cannot drift apart.
 */
trait ResolvesCartToken
{
    protected function cartToken(Request $request): ?string
    {
        $header = $request->header('X-Cart-Token');

        if (is_string($header) && $header !== '') {
            return $header;
        }

        $cookie = $request->cookie('cart_token');

        return is_string($cookie) && $cookie !== '' ? $cookie : null;
    }
}
