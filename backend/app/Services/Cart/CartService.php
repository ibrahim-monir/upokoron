<?php

declare(strict_types=1);

namespace App\Services\Cart;

use App\Exceptions\BusinessRuleException;
use App\Models\Cart;
use App\Models\CartItem;
use App\Models\Customer;
use App\Models\ProductVariation;
use App\Services\Inventory\ReservationService;
use App\Services\Pricing\PricedLine;
use App\Services\Pricing\PricingService;
use App\Services\Rewards\RewardPointsService;
use App\Services\Support\SettingsService;
use App\Support\Money;
use App\Support\Quantity;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * The basket, and the stock it is holding.
 *
 * Adding to the cart takes a real reservation against inventory, so what the
 * shop shows as available already excludes it. That is the point of the
 * reservation table built in Phase 5: without it, ten people can put the last
 * unit in ten baskets and nine of them find out at checkout.
 *
 * The holds are temporary. An abandoned basket gives its stock back when the
 * TTL lapses (the scheduler sweeps every five minutes), because the opposite
 * failure -- a shop that shows itself sold out while the shelves are full --
 * is worse and much harder to notice.
 */
class CartService
{
    public function __construct(
        private readonly ReservationService $reservations,
        private readonly PricingService $pricing,
        private readonly SettingsService $settings,
        private readonly CouponService $coupons,
        private readonly RewardPointsService $rewards,
    ) {}

    /**
     * Find the caller's cart, or start one.
     *
     * A signed-in customer's own active cart wins over the token, so signing
     * in on a second device shows the basket already there rather than an
     * empty one.
     */
    public function resolve(?string $token, ?Customer $customer = null): Cart
    {
        if ($customer !== null) {
            $existing = Cart::active()->where('customer_id', $customer->id)->latest('id')->first();

            if ($existing !== null) {
                // A guest basket built before signing in gets folded in, not
                // thrown away.
                if ($token !== null && $token !== $existing->token) {
                    $guest = Cart::active()->where('token', $token)->whereNull('customer_id')->first();

                    if ($guest !== null) {
                        $this->merge($guest, $existing);
                    }
                }

                return $existing;
            }
        }

        $cart = $token === null ? null : Cart::active()->where('token', $token)->first();

        if ($cart === null) {
            return Cart::create([
                'token' => (string) Str::uuid(),
                'customer_id' => $customer?->id,
                'status' => 'active',
                'last_activity_at' => now(),
                'expires_at' => $this->expiryFromNow(),
            ]);
        }

        // Claim a guest cart for whoever just signed in.
        if ($customer !== null && $cart->customer_id === null) {
            $cart->forceFill(['customer_id' => $customer->id])->save();
        }

        return $cart;
    }

    /**
     * Put something in the basket, holding the stock for it.
     *
     * Adding an item already present adds to its quantity rather than
     * creating a second line.
     */
    public function add(Cart $cart, ProductVariation $variation, Quantity|string|int $quantity): CartItem
    {
        $quantity = Quantity::of($quantity);

        $this->assertSellable($variation);
        $this->assertPositive($quantity);

        return DB::transaction(function () use ($cart, $variation, $quantity): CartItem {
            $item = CartItem::where('cart_id', $cart->id)
                ->where('product_variation_id', $variation->id)
                ->lockForUpdate()
                ->first();

            $wanted = $item === null
                ? $quantity
                : $item->quantity()->plus($quantity);

            return $this->hold($cart, $variation, $item, $wanted);
        });
    }

    /**
     * Set a line to an exact quantity. Zero removes it.
     */
    public function setQuantity(Cart $cart, CartItem $item, Quantity|string|int $quantity): ?CartItem
    {
        $quantity = Quantity::of($quantity);

        if (! $quantity->isPositive()) {
            $this->remove($cart, $item);

            return null;
        }

        $this->assertSellable($item->variation);

        return DB::transaction(fn (): CartItem => $this->hold($cart, $item->variation, $item, $quantity));
    }

    public function remove(Cart $cart, CartItem $item): void
    {
        DB::transaction(function () use ($cart, $item): void {
            if ($item->reservation !== null) {
                $this->reservations->release($item->reservation);
            }

            $item->delete();

            $this->touchCart($cart);
        });
    }

    public function clear(Cart $cart): void
    {
        DB::transaction(function () use ($cart): void {
            // By cart token rather than by item, so a hold whose line was
            // already deleted is still let go.
            $this->reservations->releaseForCart($cart->token);

            $cart->items()->delete();

            $this->touchCart($cart);
        });
    }

    /**
     * Everything the storefront needs to draw the basket.
     *
     * Prices are worked out here, from the catalogue, every single time. The
     * cart stores no money at all.
     *
     * Every line is returned -- unchecked ones included, each carrying its
     * own `is_selected` -- so the cart page can still draw and price a line
     * nobody plans to buy yet. But `priced`, `subtotal`, `discount`,
     * `coupon`, `reward_points` and `weight_kg` only count SELECTED lines:
     * those are what checkout is about to become an order from, and a
     * coupon or a free-shipping threshold has to be judged against what is
     * actually being bought, not against items sitting unchecked in the
     * same basket. `has_unheld` follows the same rule -- an unheld line
     * nobody is buying right now should not block checkout out of lines
     * that are fine.
     *
     * @return array{cart: Cart, lines: array<int, array<string, mixed>>, priced: array<int, PricedLine>, subtotal: Money, discount: Money, coupon: array<string, mixed>|null, reward_points: array<string, mixed>|null, weight_kg: Quantity, item_count: int, selected_item_count: int, has_unheld: bool}
     */
    public function summary(Cart $cart, ?Customer $customer = null): array
    {
        $cart->loadMissing([
            'items.variation.product:id,name,slug,status,published_at',
            'items.variation.image',
            'items.variation.product.primaryImage',
            'items.variation.inventory',
            'items.reservation',
            'coupon',
        ]);

        $selectedPriced = [];
        $lines = [];
        $hasUnheld = false;

        foreach ($cart->items as $item) {
            $variation = $item->variation;

            if ($variation === null) {
                continue;
            }

            $line = $this->pricing->price($variation, $item->quantity(), $customer);

            if ($item->is_selected) {
                $selectedPriced[] = $line;
            }

            $available = $variation->inventory?->available() ?? Quantity::zero();
            $held = $item->isHeld();

            if (! $held && $item->is_selected) {
                $hasUnheld = true;
            }

            $lines[] = [
                'id' => $item->id,
                'product_variation_id' => $variation->id,
                'product_id' => $variation->product_id,
                'name' => $variation->product?->name,
                'slug' => $variation->product?->slug,
                'variation' => $variation->displayName(),
                'sku' => $variation->sku,
                'image' => ($variation->image ?? $variation->product?->primaryImage)?->url(),
                'quantity' => $item->quantity()->value(),
                'list_price' => $line->listPrice->value(),
                'unit_price' => $line->unitPrice->value(),
                'line_total' => $line->lineTotal->value(),
                'line_discount' => $line->lineDiscount->value(),
                'discount_reason' => $line->discountReason,

                /*
                 * Whether the stock is still ours. A lapsed hold does not
                 * empty the basket -- the shopper keeps seeing what they
                 * picked -- but checkout will not accept the line until it is
                 * taken again, and this is what tells the UI to say so.
                 */
                'is_held' => $held,
                'available' => $available->value(),
                'is_sellable' => $this->isSellable($variation),
                'is_selected' => $item->is_selected,
            ];
        }

        $subtotal = $this->pricing->subtotal($selectedPriced);

        return [
            'cart' => $cart,
            'lines' => $lines,
            'priced' => $selectedPriced,
            'subtotal' => $subtotal,
            'discount' => $this->pricing->totalDiscount($selectedPriced),
            'coupon' => $this->couponSummary($cart, $subtotal, $customer),
            'reward_points' => $this->rewardPointsSummary($cart, $subtotal, $customer),
            'weight_kg' => $this->pricing->totalWeight($selectedPriced),
            'item_count' => count($lines),
            'selected_item_count' => count($selectedPriced),
            'has_unheld' => $hasUnheld,
        ];
    }

    /**
     * Check or uncheck one line for the next checkout. Never removes it --
     * unchecking is "not right now", not "take this out of my cart".
     */
    public function setSelected(Cart $cart, CartItem $item, bool $selected): void
    {
        $item->forceFill(['is_selected' => $selected])->save();

        $this->touchCart($cart);
    }

    /**
     * The "select all" checkbox above the line list.
     */
    public function setAllSelected(Cart $cart, bool $selected): void
    {
        $cart->items()->update(['is_selected' => $selected]);

        $this->touchCart($cart);
    }

    /**
     * Apply a coupon to the cart. Only the code is stored; the discount
     * itself is worked out fresh on every read, the same as everything else
     * in this class.
     */
    public function applyCoupon(Cart $cart, string $code, ?Customer $customer = null): Cart
    {
        $coupon = $this->coupons->find($code);

        if ($coupon === null) {
            throw new BusinessRuleException('That coupon code was not found.', 'coupon_not_found');
        }

        $subtotal = $this->pricing->subtotal(
            $this->pricing->priceAll($this->itemsToPrice($cart), $customer),
        );

        $this->coupons->assertRedeemable($coupon, $subtotal, $customer);

        $cart->forceFill(['coupon_id' => $coupon->id])->save();

        return $cart->refresh();
    }

    public function removeCoupon(Cart $cart): void
    {
        $cart->forceFill(['coupon_id' => null])->save();
    }

    /**
     * Ask the cart to redeem this many points. Only the count is stored;
     * the discount it is worth is worked out fresh on every read, the same
     * as the coupon beside it.
     */
    public function redeemPoints(Cart $cart, int $points, Customer $customer): Cart
    {
        $subtotal = $this->pricing->subtotal(
            $this->pricing->priceAll($this->itemsToPrice($cart), $customer),
        );

        // Validate now so the shopper hears about a bad request immediately,
        // even though summary() re-validates on every read regardless.
        $this->rewards->previewRedemption($customer, $points, $subtotal);

        $cart->forceFill(['reward_points_redeemed' => $points])->save();

        return $cart->refresh();
    }

    public function removeRewardPoints(Cart $cart): void
    {
        $cart->forceFill(['reward_points_redeemed' => 0])->save();
    }

    /**
     * @return iterable<array{variation: ProductVariation, quantity: Quantity}>
     */
    private function itemsToPrice(Cart $cart): iterable
    {
        $cart->loadMissing('items.variation');

        foreach ($cart->items as $item) {
            if ($item->variation !== null) {
                yield ['variation' => $item->variation, 'quantity' => $item->quantity()];
            }
        }
    }

    /**
     * The coupon applied to this cart, revalidated against the current
     * basket. A coupon that stopped qualifying -- an item removed, the
     * window closed -- is reported as invalid with a reason rather than
     * silently dropped, so the shopper is told rather than surprised at
     * checkout.
     *
     * @return array<string, mixed>|null
     */
    private function couponSummary(Cart $cart, Money $subtotal, ?Customer $customer): ?array
    {
        $coupon = $cart->coupon;

        if ($coupon === null) {
            return null;
        }

        try {
            $this->coupons->assertRedeemable($coupon, $subtotal, $customer);

            return [
                'id' => $coupon->id,
                'code' => $coupon->code,
                'discount' => $this->coupons->discountFor($coupon, $subtotal)->value(),
                'is_valid' => true,
                'message' => null,
            ];
        } catch (BusinessRuleException $e) {
            return [
                'id' => $coupon->id,
                'code' => $coupon->code,
                'discount' => '0.00',
                'is_valid' => false,
                'message' => $e->getMessage(),
            ];
        }
    }

    /**
     * The points redemption requested against this cart, revalidated
     * against the customer's live balance and the current subtotal. A
     * redemption that stopped qualifying -- an item removed since, a manual
     * debit that lowered the balance -- is reported invalid with a reason
     * rather than silently dropped.
     *
     * @return array<string, mixed>|null
     */
    private function rewardPointsSummary(Cart $cart, Money $subtotal, ?Customer $customer): ?array
    {
        if ($customer === null || $cart->reward_points_redeemed <= 0) {
            return null;
        }

        $points = $cart->reward_points_redeemed;

        try {
            $preview = $this->rewards->previewRedemption($customer, $points, $subtotal);

            return [
                'points' => $preview['points'],
                'discount' => $preview['discount']->value(),
                'is_valid' => true,
                'message' => null,
            ];
        } catch (BusinessRuleException $e) {
            return [
                'points' => $points,
                'discount' => '0.00',
                'is_valid' => false,
                'message' => $e->getMessage(),
            ];
        }
    }

    /**
     * Fold one basket into another, keeping the stock holds straight.
     *
     * Used when a guest signs in. Quantities add up; anything that cannot be
     * held any more is dropped rather than silently promised.
     */
    public function merge(Cart $from, Cart $into): Cart
    {
        DB::transaction(function () use ($from, $into): void {
            foreach ($from->items()->with('variation')->get() as $item) {
                if ($item->variation === null) {
                    continue;
                }

                try {
                    $this->add($into, $item->variation, $item->quantity());
                } catch (BusinessRuleException) {
                    // Out of stock now. The customer sees the merged basket
                    // without it, which is honest; promising it and failing
                    // at checkout is not.
                }
            }

            $this->clear($from);

            $from->forceFill(['status' => 'abandoned'])->save();
        });

        return $into->refresh();
    }

    /**
     * Take, adjust, or re-take the stock hold behind a line.
     *
     * Release-then-reserve rather than adjusting in place: the whole thing
     * runs inside one transaction, and reserve() locks the inventory row, so
     * nobody can slip in between the two halves and take the stock we just
     * let go of.
     */
    private function hold(Cart $cart, ProductVariation $variation, ?CartItem $item, Quantity $wanted): CartItem
    {
        if ($item?->reservation !== null) {
            $this->reservations->release($item->reservation);
        }

        $reservation = $this->reservations->reserve(
            variation: $variation,
            quantity: $wanted,
            cartToken: $cart->token,
        );

        if ($item === null) {
            $item = CartItem::create([
                'cart_id' => $cart->id,
                'product_variation_id' => $variation->id,
                'quantity' => $wanted->value(),
                'stock_reservation_id' => $reservation->id,
            ]);
        } else {
            $item->forceFill([
                'quantity' => $wanted->value(),
                'stock_reservation_id' => $reservation->id,
            ])->save();
        }

        $this->touchCart($cart);

        return $item->refresh();
    }

    private function touchCart(Cart $cart): void
    {
        $cart->forceFill([
            'last_activity_at' => now(),
            'expires_at' => $this->expiryFromNow(),
        ])->save();
    }

    private function expiryFromNow(): \Illuminate\Support\Carbon
    {
        return now()->addMinutes($this->settings->int('reservation_ttl_minutes', 30));
    }

    private function isSellable(ProductVariation $variation): bool
    {
        return $variation->is_active
            && $variation->product !== null
            && $variation->product->status->isSellable()
            && ($variation->product->published_at === null
                || ! $variation->product->published_at->isFuture());
    }

    private function assertSellable(ProductVariation $variation): void
    {
        if (! $this->isSellable($variation)) {
            throw new BusinessRuleException(
                'That product is not available.',
                'not_purchasable',
                ['product_variation_id' => $variation->id],
            );
        }
    }

    private function assertPositive(Quantity $quantity): void
    {
        if (! $quantity->isPositive()) {
            throw new BusinessRuleException(
                'A quantity must be more than zero.',
                'invalid_quantity',
            );
        }
    }
}
