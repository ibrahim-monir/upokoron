<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1\Shop;

use App\Http\Controllers\Api\V1\Shop\Concerns\ResolvesCartToken;
use App\Http\Controllers\Controller;
use App\Models\Cart;
use App\Models\CartItem;
use App\Models\Customer;
use App\Models\ProductVariation;
use App\Services\Cart\CartService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Cookie;

/**
 * The storefront basket.
 *
 * Works signed in or not. A guest is identified by a cart token, which the
 * server sets as a cookie and also returns in the body -- the SPA does not
 * have to store anything, but it can if it wants to (a header wins over the
 * cookie, which is what makes the token portable to a mobile client later).
 *
 * Every request that touches money answers with the full recalculated cart,
 * never a partial update. It costs one query more and removes a whole class
 * of bug where the browser's idea of the total drifts from the server's.
 */
class CartController extends Controller
{
    use ResolvesCartToken;

    private const COOKIE = 'cart_token';

    private const COOKIE_DAYS = 30;

    public function __construct(private readonly CartService $carts) {}

    public function show(Request $request): JsonResponse
    {
        $cart = $this->cart($request);

        return $this->respond($cart, $request);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'product_variation_id' => ['required', 'integer', 'exists:product_variations,id'],
            // Capped so a typo (or a script) cannot reserve the entire shelf
            // and lock every other shopper out of the product.
            'quantity' => ['required', 'numeric', 'min:0.001', 'max:1000'],
        ]);

        $cart = $this->cart($request);

        $variation = ProductVariation::with('product')->findOrFail($data['product_variation_id']);

        $this->carts->add($cart, $variation, (string) $data['quantity']);

        return $this->respond($cart->refresh(), $request, 201);
    }

    public function update(Request $request, CartItem $item): JsonResponse
    {
        $data = $request->validate([
            'quantity' => ['required', 'numeric', 'min:0', 'max:1000'],
        ]);

        $cart = $this->cart($request);

        // A cart item id is a guessable integer, so ownership is checked
        // rather than assumed: without this, anyone could empty anyone's
        // basket by counting upwards.
        abort_unless($item->cart_id === $cart->id, 404);

        $item->loadMissing(['variation.product', 'reservation']);

        $this->carts->setQuantity($cart, $item, (string) $data['quantity']);

        return $this->respond($cart->refresh(), $request);
    }

    public function destroy(Request $request, CartItem $item): JsonResponse
    {
        $cart = $this->cart($request);

        abort_unless($item->cart_id === $cart->id, 404);

        $item->loadMissing('reservation');

        $this->carts->remove($cart, $item);

        return $this->respond($cart->refresh(), $request);
    }

    public function clear(Request $request): JsonResponse
    {
        $cart = $this->cart($request);

        $this->carts->clear($cart);

        return $this->respond($cart->refresh(), $request);
    }

    private function cart(Request $request): Cart
    {
        return $this->carts->resolve($this->cartToken($request), $this->customer($request));
    }

    private function customer(Request $request): ?Customer
    {
        return $request->user()?->customer;
    }

    private function respond(Cart $cart, Request $request, int $status = 200): JsonResponse
    {
        $summary = $this->carts->summary($cart, $this->customer($request));

        $response = response()->json([
            'data' => [
                'token' => $cart->token,
                'items' => $summary['lines'],
                'item_count' => $summary['item_count'],
                'subtotal' => $summary['subtotal']->value(),
                'discount' => $summary['discount']->value(),
                'weight_kg' => $summary['weight_kg']->value(),

                // True when a hold has lapsed. The UI shows the line as no
                // longer reserved instead of quietly dropping it, and
                // checkout refuses until it is taken again.
                'has_unheld_items' => $summary['has_unheld'],

                'expires_at' => $cart->expires_at?->toIso8601String(),
            ],
        ], $status);

        return $response->withCookie(new Cookie(
            name: self::COOKIE,
            value: $cart->token,
            expire: now()->addDays(self::COOKIE_DAYS)->getTimestamp(),
            path: '/',
            secure: $request->isSecure(),
            httpOnly: true,
            sameSite: Cookie::SAMESITE_LAX,
        ));
    }
}
