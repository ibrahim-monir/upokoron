<?php

declare(strict_types=1);

namespace Tests\Feature\Rewards;

use App\Enums\OrderStatus;
use App\Enums\ReviewStatus;
use App\Models\Customer;
use App\Models\Order;
use App\Models\PaymentMethod;
use App\Models\Product;
use App\Models\ProductReview;
use App\Models\ProductVariation;
use App\Models\ShippingRate;
use App\Models\User;
use App\Services\Cart\CartService;
use App\Services\Inventory\InventoryService;
use App\Services\Order\OrderService;
use App\Services\Order\OrderStatusService;
use App\Services\Order\PlaceOrderData;
use App\Services\Rewards\RewardPointsService;
use App\Services\Shipping\ShippingService;
use Database\Seeders\ChartOfAccountsSeeder;
use Database\Seeders\FiscalYearSeeder;
use Database\Seeders\PaymentMethodSeeder;
use Database\Seeders\ShippingZoneSeeder;
use Database\Seeders\UnitSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Points earned four ways (purchase, review, profile completion, birthday),
 * spent one way (checkout redemption, capped three ways at once), and a
 * manual adjustment for when a human needs to override all of it.
 */
class RewardPointsTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(UnitSeeder::class);
        $this->seed(ChartOfAccountsSeeder::class);
        $this->seed(FiscalYearSeeder::class);
        $this->seed(ShippingZoneSeeder::class);
        $this->seed(PaymentMethodSeeder::class);
    }

    /** @return array{0: User, 1: Customer} */
    private function customerUser(array $customerAttributes = []): array
    {
        $user = User::factory()->role('customer')->create();
        $customer = Customer::factory()->create($customerAttributes + ['user_id' => $user->id]);

        return [$user, $customer];
    }

    private function deliverOrder(Customer $customer, ProductVariation $variation, string $quantity = '1'): Order
    {
        app(InventoryService::class)->receive($variation, '100', '50000.00', counterAccount: 'accounts_payable');

        $carts = app(CartService::class);
        $cart = $carts->resolve(null, $customer);
        $carts->add($cart, $variation, $quantity);

        $zone = app(ShippingService::class)->zoneFor('Dhaka', 'Dhaka');

        $order = app(OrderService::class)->placeFromCart(
            cart: $cart,
            data: new PlaceOrderData(
                shippingRate: ShippingRate::where('shipping_zone_id', $zone->id)->sole(),
                paymentMethod: PaymentMethod::where('code', 'cod')->sole(),
                addressFields: [
                    'name' => 'Rahim Uddin',
                    'phone' => '01712345678',
                    'address_line1' => '12 Bazar Road',
                    'city' => 'Dhaka',
                    'district' => 'Dhaka',
                ],
            ),
            customer: $customer,
        );

        $statuses = app(OrderStatusService::class);
        $statuses->transition($order, OrderStatus::Confirmed);
        $statuses->transition($order->refresh(), OrderStatus::Packed);
        $statuses->transition($order->refresh(), OrderStatus::Shipped);
        $statuses->transition($order->refresh(), OrderStatus::Delivered);

        return $order->refresh();
    }

    // ─── Earning ──────────────────────────────────────────────────────────

    public function test_a_delivered_order_earns_points_on_its_net_product_spend(): void
    {
        [, $customer] = $this->customerUser();

        $variation = Product::factory()->create()->variations()->first();
        $variation->forceFill(['selling_price' => '1000.00'])->save();

        // 2 units at 1000 = 2000 subtotal -> 20 hundreds -> 20 * 5 = 100 points.
        $this->deliverOrder($customer, $variation, '2');

        $this->assertSame(100, $customer->refresh()->reward_points_balance);
    }

    public function test_delivering_the_same_order_twice_does_not_double_award(): void
    {
        [, $customer] = $this->customerUser();
        $variation = Product::factory()->create()->variations()->first();
        $variation->forceFill(['selling_price' => '1000.00'])->save();

        $order = $this->deliverOrder($customer, $variation, '2');
        $balanceAfterFirst = $customer->refresh()->reward_points_balance;

        app(RewardPointsService::class)->awardPurchase($order);

        $this->assertSame($balanceAfterFirst, $customer->refresh()->reward_points_balance);
    }

    public function test_an_approved_review_earns_points_once(): void
    {
        [$user, $customer] = $this->customerUser();
        $product = Product::factory()->create();
        $this->deliverOrder($customer, $product->variations()->first());

        $this->actingAs($user);
        $reviewId = $this->postJson("/api/v1/shop/products/{$product->slug}/reviews", [
            'rating' => 5,
            'comment' => 'Great.',
        ])->json('data.id');

        $balanceBefore = $customer->refresh()->reward_points_balance;

        $this->actingAsRole('owner');
        $this->putJson("/api/v1/admin/reviews/{$reviewId}/status", ['status' => 'approved'])->assertOk();

        $this->assertSame($balanceBefore + 10, $customer->refresh()->reward_points_balance);

        // Toggling the same review off and back on again must not pay twice.
        $this->putJson("/api/v1/admin/reviews/{$reviewId}/status", ['status' => 'rejected'])->assertOk();
        $this->putJson("/api/v1/admin/reviews/{$reviewId}/status", ['status' => 'approved'])->assertOk();

        $this->assertSame($balanceBefore + 10, $customer->refresh()->reward_points_balance);
    }

    public function test_completing_the_profile_earns_a_one_time_bonus(): void
    {
        [$user] = $this->customerUser(['phone' => null, 'date_of_birth' => null]);

        $this->actingAs($user);

        // Missing the birthday: no bonus yet.
        $this->putJson('/api/v1/shop/auth/profile', [
            'name' => 'Karim',
            'phone' => '01812345678',
        ])->assertOk();

        $this->assertSame(0, $user->customer->refresh()->reward_points_balance);

        // The last field lands: the bonus fires now, whichever field that was.
        $this->putJson('/api/v1/shop/auth/profile', [
            'name' => 'Karim',
            'phone' => '01812345678',
            'date_of_birth' => '1995-05-20',
        ])->assertOk();

        $this->assertSame(50, $user->customer->refresh()->reward_points_balance);

        // Saving again afterwards must not pay a second time.
        $this->putJson('/api/v1/shop/auth/profile', [
            'name' => 'Karim Uddin',
            'phone' => '01812345678',
            'date_of_birth' => '1995-05-20',
        ])->assertOk();

        $this->assertSame(50, $user->customer->refresh()->reward_points_balance);
    }

    public function test_the_birthday_command_pays_once_per_year(): void
    {
        [, $customer] = $this->customerUser(['date_of_birth' => now()->subYears(30)->format('Y-m-d')]);

        $awarded = app(RewardPointsService::class)->awardBirthdaysDueToday();

        $this->assertSame(1, $awarded);
        $this->assertSame(200, $customer->refresh()->reward_points_balance);

        $this->assertSame(0, app(RewardPointsService::class)->awardBirthdaysDueToday());
        $this->assertSame(200, $customer->refresh()->reward_points_balance);
    }

    // ─── Manual adjustment ────────────────────────────────────────────────

    public function test_an_admin_can_credit_and_debit_points_manually(): void
    {
        [, $customer] = $this->customerUser();
        $admin = $this->actingAsRole('manager');

        $this->postJson('/api/v1/admin/rewards/adjustments', [
            'customer_id' => $customer->id,
            'points' => 150,
            'reason' => 'Goodwill gesture',
        ])->assertOk()->assertJsonPath('data.reward_points_balance', 150);

        $this->postJson('/api/v1/admin/rewards/adjustments', [
            'customer_id' => $customer->id,
            'points' => -50,
            'reason' => 'Correcting a duplicate credit',
        ])->assertOk()->assertJsonPath('data.reward_points_balance', 100);

        $this->assertSame(100, $customer->refresh()->reward_points_balance);
    }

    public function test_a_manual_debit_cannot_exceed_the_balance(): void
    {
        [, $customer] = $this->customerUser();
        $this->actingAsRole('manager');

        $this->postJson('/api/v1/admin/rewards/adjustments', [
            'customer_id' => $customer->id,
            'points' => -10,
            'reason' => 'Too many',
        ])->assertStatus(409);
    }

    public function test_a_role_without_the_permission_cannot_adjust_points(): void
    {
        [, $customer] = $this->customerUser();
        $this->actingAsRole('accountant');

        $this->postJson('/api/v1/admin/rewards/adjustments', [
            'customer_id' => $customer->id,
            'points' => 100,
            'reason' => 'Test',
        ])->assertForbidden();
    }

    // ─── Redemption ───────────────────────────────────────────────────────

    public function test_redeeming_points_discounts_the_order_and_debits_the_balance(): void
    {
        [$user, $customer] = $this->customerUser();
        app(RewardPointsService::class)->adjustManually($customer, 500, 'Seed balance', $this->actingAsRole('owner'));

        $variation = Product::factory()->create()->variations()->first();
        $variation->forceFill(['selling_price' => '5000.00'])->save();
        app(InventoryService::class)->receive($variation, '10', '5000.00', counterAccount: 'accounts_payable');

        $this->actingAs($user);
        $carts = app(CartService::class);
        $cart = $carts->resolve(null, $customer);
        $carts->add($cart, $variation, '1');

        // Cap is 20% of a 5000 subtotal = 1000, so all 200 held points clear
        // both the per-order cap (200) and the percent-of-cart cap (1000).
        $this->postJson('/api/v1/shop/cart/reward-points', ['points' => 200])
            ->assertOk()
            ->assertJsonPath('data.reward_points.points', 200)
            ->assertJsonPath('data.reward_points.discount', '200.00');

        $zone = app(ShippingService::class)->zoneFor('Dhaka', 'Dhaka');

        $order = app(OrderService::class)->placeFromCart(
            cart: $cart->refresh(),
            data: new PlaceOrderData(
                shippingRate: ShippingRate::where('shipping_zone_id', $zone->id)->sole(),
                paymentMethod: PaymentMethod::where('code', 'cod')->sole(),
                addressFields: [
                    'name' => 'Rahim Uddin',
                    'phone' => '01712345678',
                    'address_line1' => '12 Bazar Road',
                    'city' => 'Dhaka',
                    'district' => 'Dhaka',
                ],
            ),
            customer: $customer->refresh(),
        );

        $this->assertSame(200, $order->reward_points_used);
        $this->assertSame('200.00', $order->reward_points_discount);

        $expectedTotal = bcadd($order->subtotal, $order->shipping_charge, 2);
        $expectedTotal = bcadd($expectedTotal, $order->extra_charge, 2);
        $expectedTotal = bcsub($expectedTotal, $order->coupon_discount, 2);
        $expectedTotal = bcsub($expectedTotal, $order->reward_points_discount, 2);

        $this->assertSame($expectedTotal, $order->total);
        $this->assertSame(300, $customer->refresh()->reward_points_balance);
    }

    public function test_redemption_is_capped_at_the_percent_of_cart_value(): void
    {
        [$user, $customer] = $this->customerUser();
        app(RewardPointsService::class)->adjustManually($customer, 500, 'Seed balance', $this->actingAsRole('owner'));

        $variation = Product::factory()->create()->variations()->first();
        // 20% of 100 is 20 BDT, worth 20 points at a 1.00 rate -- far under
        // both the 500 balance and the 200-point order cap.
        $variation->forceFill(['selling_price' => '100.00'])->save();
        app(InventoryService::class)->receive($variation, '10', '500.00', counterAccount: 'accounts_payable');

        $this->actingAs($user);
        $carts = app(CartService::class);
        $cart = $carts->resolve(null, $customer);
        $carts->add($cart, $variation, '1');

        $this->postJson('/api/v1/shop/cart/reward-points', ['points' => 100])
            ->assertStatus(409)
            ->assertJsonPath('code', 'reward_points_above_maximum');
    }

    public function test_redemption_below_the_minimum_is_refused(): void
    {
        [$user, $customer] = $this->customerUser();
        app(RewardPointsService::class)->adjustManually($customer, 500, 'Seed balance', $this->actingAsRole('owner'));

        $variation = Product::factory()->create()->variations()->first();
        $variation->forceFill(['selling_price' => '5000.00'])->save();
        app(InventoryService::class)->receive($variation, '10', '5000.00', counterAccount: 'accounts_payable');

        $this->actingAs($user);
        $carts = app(CartService::class);
        $cart = $carts->resolve(null, $customer);
        $carts->add($cart, $variation, '1');

        $this->postJson('/api/v1/shop/cart/reward-points', ['points' => 10])
            ->assertStatus(409)
            ->assertJsonPath('code', 'reward_points_below_minimum');
    }

    // ─── Customer-facing history ───────────────────────────────────────────

    public function test_a_customer_can_see_their_own_reward_point_history_only(): void
    {
        [$user, $customer] = $this->customerUser();
        [$otherUser, $otherCustomer] = $this->customerUser();

        $rewards = app(RewardPointsService::class);
        $owner = $this->actingAsRole('owner');
        $rewards->adjustManually($customer, 100, 'Goodwill', $owner);
        $rewards->adjustManually($otherCustomer, 999, 'Not this customer', $owner);

        $this->actingAs($user);
        $this->getJson('/api/v1/shop/rewards/history')
            ->assertOk()
            ->assertJsonPath('balance', 100)
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.points', 100)
            ->assertJsonPath('data.0.type', 'manual_credit');

        $this->assertNotEquals($otherUser->id, $user->id);
    }

    public function test_a_guest_cannot_see_reward_point_history(): void
    {
        $this->getJson('/api/v1/shop/rewards/history')->assertUnauthorized();
    }

    // ─── Expiry ───────────────────────────────────────────────────────────

    public function test_the_process_command_expires_lapsed_points_oldest_first(): void
    {
        [, $customer] = $this->customerUser();
        $rewards = app(RewardPointsService::class);
        $owner = $this->actingAsRole('owner');

        $rewards->adjustManually($customer, 100, 'Old batch', $owner);

        // Back-date the lot past its validity window.
        $customer->rewardPointTransactions()->update(['expires_at' => now()->subDay()]);

        $rewards->adjustManually($customer, 50, 'Recent batch', $owner);

        $this->assertSame(150, $customer->refresh()->reward_points_balance);

        $this->artisan('rewards:process')->assertSuccessful();

        // Only the back-dated 100 lapses; the recent 50 is untouched.
        $this->assertSame(50, $customer->refresh()->reward_points_balance);
    }
}
