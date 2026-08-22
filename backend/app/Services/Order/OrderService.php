<?php

declare(strict_types=1);

namespace App\Services\Order;

use App\Enums\OrderStatus;
use App\Enums\PaymentStatus;
use App\Exceptions\BusinessRuleException;
use App\Models\Cart;
use App\Models\Coupon;
use App\Models\Customer;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\OrderStatusHistory;
use App\Models\ProductVariation;
use App\Models\StockReservation;
use App\Services\Cart\CartService;
use App\Services\Pricing\PricedLine;
use App\Services\Rewards\RewardPointsService;
use App\Services\Shipping\ShippingService;
use App\Services\Support\DocumentNumberService;
use App\Support\Money;
use App\Support\Quantity;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;

/**
 * Turning a basket into a sale.
 *
 * Placing an order posts NOTHING to the ledger. That surprises people, so it
 * is worth saying why: an order is a promise, not a transaction. The shop has
 * not earned anything and the customer has not paid anything. On cash on
 * delivery -- which is most of this shop's trade -- a good share of orders
 * never become revenue at all. Recognising them at placement would inflate
 * sales and receivables by every parcel that later comes back.
 *
 * What DOES happen here: prices are recomputed from the catalogue, totals are
 * built server-side, and the stock reservations the cart was holding are
 * transferred to the order so they stop expiring.
 */
class OrderService
{
    public function __construct(
        private readonly CartService $carts,
        private readonly ShippingService $shipping,
        private readonly DocumentNumberService $numbers,
        private readonly RewardPointsService $rewards,
    ) {}

    /**
     * Place an order for everything in a cart.
     */
    public function placeFromCart(
        Cart $cart,
        PlaceOrderData $data,
        ?Customer $customer = null,
        ?Model $placedBy = null,
    ): Order {
        $customer ??= $cart->customer;

        $this->assertCustomerMayOrder($customer);

        $summary = $this->carts->summary($cart, $customer);

        if ($summary['item_count'] === 0) {
            throw new BusinessRuleException('There is nothing in the cart.', 'empty_cart');
        }

        /*
         * Every line must still be held. A lapsed hold means the stock was
         * given back to the shop while the customer was deciding, and it may
         * already be in someone else's basket -- confirming the order anyway
         * would promise goods that are not there.
         */
        if ($summary['has_unheld']) {
            throw new BusinessRuleException(
                'Some items are no longer reserved. Open your cart and adjust them before ordering.',
                'stock_no_longer_held',
            );
        }

        $shippingFields = $data->shippingFields();

        $this->assertAddressIsComplete($shippingFields);

        // The zone comes from the ADDRESS, not from the request. A browser
        // that could name its own zone would name the cheapest one.
        $zone = $this->shipping->zoneFor($shippingFields['district'], $shippingFields['city']);

        if ($data->shippingRate->shipping_zone_id !== $zone->id) {
            throw new BusinessRuleException(
                'That delivery option does not cover the address given.',
                'shipping_rate_wrong_zone',
                ['expected_zone' => $zone->name],
            );
        }

        $subtotal = $summary['subtotal'];
        $requiresCod = $data->paymentMethod->type->isCollectedOnDelivery();

        /*
         * The coupon was already chosen -- applied to the cart on an earlier
         * request -- so there is nothing to read from $data here. What
         * matters is that it is still good: the summary just revalidated it
         * against the live basket, and a coupon that stopped qualifying is
         * refused rather than quietly dropped, so the customer is not
         * charged more than the total they were just shown.
         */
        $couponId = null;
        $couponCode = null;
        $couponDiscount = Money::zero();

        if ($summary['coupon'] !== null) {
            if (! $summary['coupon']['is_valid']) {
                throw new BusinessRuleException(
                    $summary['coupon']['message'] ?? 'That coupon no longer applies. Remove it and try again.',
                    'coupon_no_longer_valid',
                );
            }

            $couponId = $summary['coupon']['id'];
            $couponCode = $summary['coupon']['code'];
            $couponDiscount = Money::of($summary['coupon']['discount']);
        }

        /*
         * Same story as the coupon: the redemption was requested on the cart
         * earlier and revalidated by the summary just now, against whatever
         * the customer's balance and this subtotal are at this moment.
         */
        $rewardPointsUsed = 0;
        $rewardPointsDiscount = Money::zero();

        if ($summary['reward_points'] !== null) {
            if (! $summary['reward_points']['is_valid']) {
                throw new BusinessRuleException(
                    $summary['reward_points']['message'] ?? 'That points redemption no longer applies. Remove it and try again.',
                    'reward_points_no_longer_valid',
                );
            }

            $rewardPointsUsed = $summary['reward_points']['points'];
            $rewardPointsDiscount = Money::of($summary['reward_points']['discount']);
        }

        // Re-priced here rather than trusted from the quote the browser saw.
        $shippingCharge = $this->shipping->chargeForRate(
            rate: $data->shippingRate,
            subtotal: $subtotal,
            weightKg: $summary['weight_kg'],
            requiresCod: $requiresCod,
        );

        $extraCharge = Money::of($data->paymentMethod->extra_charge);
        $total = $subtotal->plus($shippingCharge)->plus($extraCharge)
            ->minus($couponDiscount)->minus($rewardPointsDiscount);

        if (! $data->paymentMethod->is_active || ! $data->paymentMethod->acceptsTotal($total)) {
            throw new BusinessRuleException(
                'That payment method is not available for this order.',
                'payment_method_unavailable',
                ['payment_method' => $data->paymentMethod->name],
            );
        }

        return DB::transaction(function () use (
            $cart, $data, $customer, $placedBy, $summary, $shippingFields,
            $zone, $subtotal, $shippingCharge, $extraCharge, $total,
            $couponId, $couponCode, $couponDiscount,
            $rewardPointsUsed, $rewardPointsDiscount,
        ): Order {
            $order = new Order;

            $order->forceFill([
                'number' => $this->numbers->next('order'),
                'customer_id' => $customer?->id,
                'cart_id' => $cart->id,
                'status' => OrderStatus::Pending,
                'payment_status' => PaymentStatus::Unpaid,
                'payment_method_id' => $data->paymentMethod->id,
                'customer_address_id' => $data->address?->id,

                'ship_name' => $shippingFields['name'],
                'ship_phone' => $shippingFields['phone'],
                'ship_address_line1' => $shippingFields['address_line1'],
                'ship_address_line2' => $shippingFields['address_line2'],
                'ship_area' => $shippingFields['area'],
                'ship_city' => $shippingFields['city'],
                'ship_district' => $shippingFields['district'],
                'ship_postcode' => $shippingFields['postcode'],
                'ship_country' => $shippingFields['country'] ?: 'BD',

                'shipping_zone_id' => $zone->id,
                'shipping_rate_id' => $data->shippingRate->id,
                'shipping_method_name' => $data->shippingRate->name,

                'coupon_id' => $couponId,
                'coupon_code' => $couponCode,

                'subtotal' => $subtotal->value(),
                'discount_total' => $summary['discount']->value(),
                'coupon_discount' => $couponDiscount->value(),
                'reward_points_used' => $rewardPointsUsed,
                'reward_points_discount' => $rewardPointsDiscount->value(),
                'shipping_charge' => $shippingCharge->value(),
                'extra_charge' => $extraCharge->value(),
                'total' => $total->value(),
                'weight_kg' => $summary['weight_kg']->value(),

                'customer_note' => $data->customerNote,
                'placed_at' => now(),
                'placed_by' => $placedBy?->getKey(),
            ])->save();

            // Written through the query builder rather than the model, so
            // this survives concurrent orders redeeming the same code
            // without one overwriting the other's increment.
            if ($couponId !== null) {
                Coupon::whereKey($couponId)->increment('used_count');
            }

            if ($rewardPointsUsed > 0 && $customer !== null) {
                $this->rewards->redeem($customer, $rewardPointsUsed, $order);
            }

            foreach ($summary['priced'] as $line) {
                $this->writeItem($order, $line->variation, $line);
            }

            $this->transferReservations($cart, $order);

            $cart->forceFill(['status' => 'converted'])->save();

            $history = new OrderStatusHistory;

            $history->forceFill([
                'order_id' => $order->id,
                'from_status' => null,
                'to_status' => OrderStatus::Pending,
                'note' => 'Order placed',
                'user_id' => $placedBy?->getKey(),
                'created_at' => now(),
            ])->save();

            return $order->refresh();
        });
    }

    /**
     * Copy a priced line onto the order.
     *
     * Names and SKUs are copied too. A product renamed next month must not
     * rewrite what this invoice says was sold.
     */
    private function writeItem(Order $order, ProductVariation $variation, PricedLine $line): OrderItem
    {
        $item = new OrderItem;

        $item->forceFill([
            'order_id' => $order->id,
            'product_variation_id' => $variation->id,
            'product_name' => $variation->product?->name ?? $variation->sku,
            'variation_name' => $variation->displayName() ?: null,
            'sku' => $variation->sku,
            'quantity' => $line->quantity->value(),
            'list_price' => $line->listPrice->value(),
            'unit_price' => $line->unitPrice->value(),
            'unit_discount' => $line->unitDiscount->value(),
            'line_total' => $line->lineTotal->value(),
            'line_discount' => $line->lineDiscount->value(),

            // Cost is unknown until the goods actually leave, and is written
            // then. A cost guessed at order time would be wrong for anything
            // that ships after the next delivery arrives.
            'unit_cost' => null,
            'total_cost' => null,
        ])->save();

        return $item;
    }

    /**
     * Move the cart's stock holds onto the order.
     *
     * They stop expiring at that point: a confirmed order's stock is spoken
     * for until it ships or is cancelled, not for the next thirty minutes.
     */
    private function transferReservations(Cart $cart, Order $order): void
    {
        StockReservation::query()
            ->where('cart_token', $cart->token)
            ->where('status', 'active')
            ->update([
                'order_id' => $order->id,
                'cart_token' => null,
                'expires_at' => null,
            ]);
    }

    private function assertCustomerMayOrder(?Customer $customer): void
    {
        if ($customer !== null && $customer->is_blocked) {
            throw new BusinessRuleException(
                'This account cannot place orders. Please contact us.',
                'customer_blocked',
            );
        }
    }

    /**
     * @param  array<string, string|null>  $fields
     */
    private function assertAddressIsComplete(array $fields): void
    {
        foreach (['name', 'phone', 'address_line1', 'city', 'district'] as $required) {
            if (blank($fields[$required] ?? null)) {
                throw new BusinessRuleException(
                    'The delivery address is incomplete.',
                    'incomplete_address',
                    ['missing' => $required],
                );
            }
        }
    }

    /**
     * Total quantity on an order, for pick lists and reporting.
     */
    public function totalQuantity(Order $order): Quantity
    {
        return $order->items->reduce(
            static fn (Quantity $carry, OrderItem $item): Quantity => $carry->plus($item->quantity()),
            Quantity::zero(),
        );
    }
}
