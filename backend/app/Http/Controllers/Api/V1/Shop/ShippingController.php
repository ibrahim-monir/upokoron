<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1\Shop;

use App\Http\Controllers\Api\V1\Shop\Concerns\ResolvesCartToken;
use App\Http\Controllers\Controller;
use App\Models\ShippingZone;
use App\Services\Cart\CartService;
use App\Services\Shipping\ShippingService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * "What will delivery cost to my address?"
 *
 * The subtotal comes from the caller's own cart, never from the request. A
 * browser that could name its own subtotal could name one just above the
 * free-delivery threshold and get free shipping on a ৳200 order.
 */
class ShippingController extends Controller
{
    use ResolvesCartToken;

    public function __construct(
        private readonly ShippingService $shipping,
        private readonly CartService $carts,
    ) {}

    public function quote(Request $request): JsonResponse
    {
        $data = $request->validate([
            'district' => ['required', 'string', 'max:100'],
            'city' => ['nullable', 'string', 'max:100'],
            'cod' => ['sometimes', 'boolean'],
        ]);

        $customer = $request->user()?->customer;
        $cart = $this->carts->resolve($this->cartToken($request), $customer);
        $summary = $this->carts->summary($cart, $customer);

        $zone = $this->shipping->zoneFor($data['district'], $data['city'] ?? null);

        $options = $this->shipping->quote(
            zone: $zone,
            subtotal: $summary['subtotal'],
            weightKg: $summary['weight_kg'],
            requiresCod: (bool) ($data['cod'] ?? false),
        );

        return response()->json([
            'data' => [
                'zone' => [
                    'id' => $zone->id,
                    'name' => $zone->name,
                    'description' => $zone->description,
                    'is_fallback' => $zone->is_fallback,
                ],
                'subtotal' => $summary['subtotal']->value(),
                'options' => $options,
            ],
        ]);
    }

    /**
     * Where the shop delivers, for a "delivery charges" page.
     */
    public function zones(): JsonResponse
    {
        $zones = ShippingZone::query()
            ->active()
            ->with(['areas:id,shipping_zone_id,district,city', 'rates'])
            ->orderBy('position')
            ->get();

        return response()->json([
            'data' => $zones->map(fn ($zone): array => [
                'id' => $zone->id,
                'name' => $zone->name,
                'description' => $zone->description,
                'is_fallback' => $zone->is_fallback,
                'areas' => $zone->areas->map(fn ($area): array => [
                    'district' => $area->district,
                    'city' => $area->city,
                ])->all(),
                'rates' => $zone->rates->where('is_active', true)->map(fn ($rate): array => [
                    'name' => $rate->name,
                    'charge' => $rate->base_charge,
                    'free_above_subtotal' => $rate->free_above_subtotal,
                    'estimate' => $rate->estimateLabel(),
                    'supports_cod' => $rate->supports_cod,
                ])->values()->all(),
            ])->all(),
        ]);
    }

}
