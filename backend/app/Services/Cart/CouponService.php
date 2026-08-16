<?php

declare(strict_types=1);

namespace App\Services\Cart;

use App\Enums\CouponType;
use App\Exceptions\BusinessRuleException;
use App\Models\Coupon;
use App\Models\Customer;
use App\Models\Order;
use App\Support\Money;
use Illuminate\Support\Str;

/**
 * Whether a coupon applies, and what it is worth.
 *
 * Nothing here is cached or stored ahead of time. A coupon is looked up and
 * checked fresh every time it matters -- applying it to a cart, showing the
 * cart, and placing the order all call the same two methods, so there is
 * exactly one definition of "valid" rather than three that can drift apart.
 */
class CouponService
{
    public function find(string $code): ?Coupon
    {
        $code = trim($code);

        if ($code === '') {
            return null;
        }

        return Coupon::whereRaw('UPPER(code) = ?', [Str::upper($code)])->first();
    }

    /**
     * Throws with a message written for the shopper the moment it stops
     * qualifying -- an order that got smaller, a code that expired while the
     * tab sat open, a per-customer limit already used up.
     */
    public function assertRedeemable(Coupon $coupon, Money $subtotal, ?Customer $customer): void
    {
        if (! $coupon->is_active) {
            throw new BusinessRuleException('This coupon is no longer active.', 'coupon_inactive');
        }

        if (! $coupon->isWithinWindow()) {
            throw new BusinessRuleException('This coupon has expired.', 'coupon_expired');
        }

        if ($coupon->min_order_total !== null
            && $subtotal->lessThan(Money::of($coupon->min_order_total))) {
            throw new BusinessRuleException(
                "This coupon needs an order of at least ".Money::of($coupon->min_order_total)->format().'.',
                'coupon_min_order_not_met',
                ['min_order_total' => $coupon->min_order_total],
            );
        }

        if (! $coupon->hasRemainingUses()) {
            throw new BusinessRuleException('This coupon has already been fully redeemed.', 'coupon_usage_limit_reached');
        }

        if ($coupon->customer_group_id !== null
            && $customer?->customer_group_id !== $coupon->customer_group_id) {
            throw new BusinessRuleException('This coupon is not available for this account.', 'coupon_not_eligible');
        }

        if ($coupon->usage_limit_per_customer !== null && $customer !== null) {
            $used = Order::where('customer_id', $customer->id)
                ->where('coupon_id', $coupon->id)
                ->count();

            if ($used >= $coupon->usage_limit_per_customer) {
                throw new BusinessRuleException(
                    'This coupon has already been used on a previous order.',
                    'coupon_customer_limit_reached',
                );
            }
        }
    }

    /**
     * What the coupon takes off, capped so it can never exceed the order.
     */
    public function discountFor(Coupon $coupon, Money $subtotal): Money
    {
        $discount = $coupon->type === CouponType::Percentage
            ? $subtotal->times((string) $coupon->value)->dividedBy('100')
            : Money::of($coupon->value);

        if ($coupon->max_discount_amount !== null) {
            $cap = Money::of($coupon->max_discount_amount);

            if ($discount->greaterThan($cap)) {
                $discount = $cap;
            }
        }

        return $discount->greaterThan($subtotal) ? $subtotal : $discount;
    }
}
