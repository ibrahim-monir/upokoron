<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1\Shop;

use App\Enums\OrderStatus;
use App\Http\Controllers\Api\V1\Shop\Concerns\ResolvesCartToken;
use App\Http\Controllers\Controller;
use App\Http\Resources\OrderResource;
use App\Models\CustomerAddress;
use App\Models\Order;
use App\Models\PaymentMethod;
use App\Models\ShippingRate;
use App\Services\Cart\CartService;
use App\Services\Order\OrderService;
use App\Services\Order\OrderStatusService;
use App\Services\Order\PlaceOrderData;
use App\Services\Shipping\ShippingService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Checkout.
 *
 * Note what the request is allowed to contain: an address, a delivery choice,
 * a payment method, a note. No prices, no totals. Every figure on the finished
 * order is computed by OrderService from the cart and the catalogue, so a
 * doctored request buys nothing.
 */
class CheckoutController extends Controller
{
    use ResolvesCartToken;

    public function __construct(
        private readonly CartService $carts,
        private readonly OrderService $orders,
        private readonly OrderStatusService $statuses,
        private readonly ShippingService $shipping,
    ) {}

    /**
     * Everything the checkout screen needs in one request.
     */
    public function show(Request $request): JsonResponse
    {
        $customer = $request->user()?->customer;
        $cart = $this->carts->resolve($this->cartToken($request), $customer);
        $summary = $this->carts->summary($cart, $customer);

        $addresses = $customer === null
            ? []
            : CustomerAddress::where('customer_id', $customer->id)
                ->orderByDesc('is_default_shipping')
                ->orderBy('id')
                ->get()
                ->map(fn (CustomerAddress $a): array => [
                    'id' => $a->id,
                    'label' => $a->label,
                    'name' => $a->name,
                    'phone' => $a->phone,
                    'address_line1' => $a->address_line1,
                    'address_line2' => $a->address_line2,
                    'area' => $a->area,
                    'city' => $a->city,
                    'district' => $a->district,
                    'is_default_shipping' => $a->is_default_shipping,
                ])->all();

        $subtotal = $summary['subtotal'];

        return response()->json([
            'data' => [
                'items' => $summary['lines'],
                'item_count' => $summary['item_count'],
                'subtotal' => $subtotal->value(),
                'discount' => $summary['discount']->value(),
                'has_unheld_items' => $summary['has_unheld'],
                'addresses' => $addresses,

                'payment_methods' => PaymentMethod::query()
                    ->active()
                    ->orderBy('position')
                    ->get()
                    // Methods the order is too large or too small for are
                    // left out here rather than failing after the customer
                    // has filled in everything else.
                    ->filter(fn (PaymentMethod $m): bool => $m->acceptsTotal($subtotal))
                    ->map(fn (PaymentMethod $m): array => [
                        'id' => $m->id,
                        'code' => $m->code,
                        'name' => $m->name,
                        'type' => $m->type->value,
                        'instructions' => $m->instructions,
                        'extra_charge' => $m->extra_charge,
                        'is_cod' => $m->type->isCollectedOnDelivery(),
                    ])->values()->all(),
            ],
        ]);
    }

    /**
     * Delivery options for an address, priced against this cart.
     */
    public function shippingOptions(Request $request): JsonResponse
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

        return response()->json([
            'data' => [
                'zone' => ['id' => $zone->id, 'name' => $zone->name],
                'options' => $this->shipping->quote(
                    zone: $zone,
                    subtotal: $summary['subtotal'],
                    weightKg: $summary['weight_kg'],
                    requiresCod: (bool) ($data['cod'] ?? false),
                ),
            ],
        ]);
    }

    /**
     * Place the order.
     */
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'shipping_rate_id' => ['required', 'integer', 'exists:shipping_rates,id'],
            'payment_method_id' => ['required', 'integer', 'exists:payment_methods,id'],
            'customer_note' => ['nullable', 'string', 'max:500'],

            // Either a saved address...
            'customer_address_id' => ['nullable', 'integer'],

            // ...or one typed in. Guests only ever have the second.
            'address' => ['nullable', 'array'],
            'address.name' => ['required_without:customer_address_id', 'string', 'max:120'],
            'address.phone' => [
                'required_without:customer_address_id',
                'string',
                'regex:/^(\+?88)?01[3-9]\d{8}$/',
            ],
            'address.address_line1' => ['required_without:customer_address_id', 'string', 'max:200'],
            'address.address_line2' => ['nullable', 'string', 'max:200'],
            'address.area' => ['nullable', 'string', 'max:100'],
            'address.city' => ['required_without:customer_address_id', 'string', 'max:100'],
            'address.district' => ['required_without:customer_address_id', 'string', 'max:100'],
            'address.postcode' => ['nullable', 'string', 'max:20'],
        ]);

        $customer = $request->user()?->customer;
        $cart = $this->carts->resolve($this->cartToken($request), $customer);

        $address = null;

        if (! empty($data['customer_address_id'])) {
            // Scoped to the caller: an address id is a guessable integer, and
            // without this anyone could post an order to someone else's home.
            abort_if($customer === null, 403, 'Sign in to use a saved address.');

            $address = CustomerAddress::where('customer_id', $customer->id)
                ->findOrFail($data['customer_address_id']);
        }

        $order = $this->orders->placeFromCart(
            cart: $cart,
            data: new PlaceOrderData(
                shippingRate: ShippingRate::findOrFail($data['shipping_rate_id']),
                paymentMethod: PaymentMethod::findOrFail($data['payment_method_id']),
                address: $address,
                addressFields: $data['address'] ?? null,
                customerNote: $data['customer_note'] ?? null,
            ),
            customer: $customer,
        );

        return response()->json([
            'message' => 'Order placed.',
            'data' => new OrderResource($order->load(['items', 'paymentMethod', 'shippingZone'])),
        ], 201);
    }

    /**
     * The customer's own orders.
     */
    public function index(Request $request): JsonResponse
    {
        $customer = $request->user()?->customer;

        abort_if($customer === null, 403, 'This account cannot place orders.');

        $orders = Order::query()
            ->where('customer_id', $customer->id)
            ->with(['items', 'paymentMethod'])
            ->latest('id')
            ->paginate($request->integer('per_page', 15));

        return response()->json([
            'data' => OrderResource::collection($orders->items()),
            'meta' => [
                'current_page' => $orders->currentPage(),
                'last_page' => $orders->lastPage(),
                'total' => $orders->total(),
            ],
        ]);
    }

    public function showOrder(Request $request, string $number): JsonResponse
    {
        $customer = $request->user()?->customer;

        abort_if($customer === null, 403, 'This account cannot place orders.');

        $order = Order::query()
            ->where('customer_id', $customer->id)
            ->where('number', $number)
            ->with(['items', 'paymentMethod', 'history', 'payments'])
            ->firstOrFail();

        return response()->json(['data' => new OrderResource($order)]);
    }

    /**
     * Cancel an order that has not shipped.
     */
    public function cancel(Request $request, string $number): JsonResponse
    {
        $customer = $request->user()?->customer;

        abort_if($customer === null, 403, 'This account cannot place orders.');

        $order = Order::query()
            ->where('customer_id', $customer->id)
            ->where('number', $number)
            ->firstOrFail();

        $data = $request->validate([
            'reason' => ['nullable', 'string', 'max:200'],
        ]);

        $this->statuses->transition(
            order: $order,
            to: OrderStatus::Cancelled,
            note: $data['reason'] ?? 'Cancelled by customer',
        );

        return response()->json(['message' => 'Order cancelled.']);
    }
}
