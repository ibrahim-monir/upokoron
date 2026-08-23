<?php

declare(strict_types=1);

namespace Tests\Feature\Catalog;

use App\Enums\OrderStatus;
use App\Models\Customer;
use App\Models\Order;
use App\Models\PaymentMethod;
use App\Models\Product;
use App\Models\ProductVariation;
use App\Models\ShippingRate;
use App\Models\User;
use App\Services\Cart\CartService;
use App\Services\Inventory\InventoryService;
use App\Services\Order\OrderService;
use App\Services\Order\OrderStatusService;
use App\Services\Order\PlaceOrderData;
use App\Services\Shipping\ShippingService;
use Database\Seeders\ChartOfAccountsSeeder;
use Database\Seeders\FiscalYearSeeder;
use Database\Seeders\PaymentMethodSeeder;
use Database\Seeders\ShippingZoneSeeder;
use Database\Seeders\UnitSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * A review only reaches the storefront after two things happen: the customer
 * proves they bought the product (a delivered order line), and staff approve
 * the text. Both gates are what stop this feature turning into an open
 * comment box under every product.
 */
class ProductReviewTest extends TestCase
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

    /**
     * A signed-in customer whose user account is linked to the customer
     * record, the same way registration wires the two together.
     */
    private function customerUser(): array
    {
        $user = User::factory()->role('customer')->create();
        $customer = Customer::factory()->create(['user_id' => $user->id]);

        return [$user, $customer];
    }

    private function deliverOneUnit(ProductVariation $variation, Customer $customer): Order
    {
        app(InventoryService::class)->receive($variation, '10', '5000.00', counterAccount: 'accounts_payable');

        $carts = app(CartService::class);
        $cart = $carts->resolve(null, $customer);
        $carts->add($cart, $variation, '1');

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

    public function test_a_customer_cannot_review_a_product_they_never_bought(): void
    {
        [$user] = $this->customerUser();
        $product = Product::factory()->create();

        $this->actingAs($user);

        $this->postJson("/api/v1/shop/products/{$product->slug}/reviews", [
            'rating' => 5,
            'comment' => 'Great product!',
        ])->assertForbidden();
    }

    public function test_a_customer_with_a_delivered_order_can_review_the_product(): void
    {
        [$user, $customer] = $this->customerUser();
        $product = Product::factory()->create();
        $this->deliverOneUnit($product->variations()->first(), $customer);

        $this->actingAs($user);

        $this->postJson("/api/v1/shop/products/{$product->slug}/reviews", [
            'rating' => 4,
            'title' => 'Solid',
            'comment' => 'Worked as expected.',
        ])->assertCreated()->assertJsonPath('data.status', 'pending');

        // Pending reviews are invisible until a moderator approves them.
        $this->getJson("/api/v1/shop/products/{$product->slug}/reviews")
            ->assertOk()
            ->assertJsonCount(0, 'data');

        $this->assertSame('0.00', $product->refresh()->rating_avg);
        $this->assertSame(0, $product->rating_count);
    }

    public function test_a_second_review_of_the_same_product_is_refused(): void
    {
        [$user, $customer] = $this->customerUser();
        $product = Product::factory()->create();
        $this->deliverOneUnit($product->variations()->first(), $customer);

        $this->actingAs($user);
        $payload = ['rating' => 5, 'comment' => 'Love it.'];

        $this->postJson("/api/v1/shop/products/{$product->slug}/reviews", $payload)->assertCreated();
        $this->postJson("/api/v1/shop/products/{$product->slug}/reviews", $payload)->assertStatus(409);
    }

    public function test_approving_a_review_makes_it_public_and_updates_the_product_rating(): void
    {
        [$user, $customer] = $this->customerUser();
        $product = Product::factory()->create();
        $this->deliverOneUnit($product->variations()->first(), $customer);

        $this->actingAs($user);
        $reviewId = $this->postJson("/api/v1/shop/products/{$product->slug}/reviews", [
            'rating' => 5,
            'comment' => 'Excellent.',
        ])->json('data.id');

        $this->actingAsRole('owner');
        $this->putJson("/api/v1/admin/reviews/{$reviewId}/status", ['status' => 'approved'])
            ->assertOk()
            ->assertJsonPath('data.status', 'approved');

        $this->assertSame('5.00', $product->refresh()->rating_avg);
        $this->assertSame(1, $product->rating_count);

        $this->getJson("/api/v1/shop/products/{$product->slug}/reviews")
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.is_verified_purchase', true);
    }

    public function test_rejecting_a_review_keeps_it_off_the_storefront(): void
    {
        [$user, $customer] = $this->customerUser();
        $product = Product::factory()->create();
        $this->deliverOneUnit($product->variations()->first(), $customer);

        $this->actingAs($user);
        $reviewId = $this->postJson("/api/v1/shop/products/{$product->slug}/reviews", [
            'rating' => 1,
            'comment' => 'Spam text unrelated to the product.',
        ])->json('data.id');

        $this->actingAsRole('owner');
        $this->putJson("/api/v1/admin/reviews/{$reviewId}/status", ['status' => 'rejected'])->assertOk();

        $this->getJson("/api/v1/shop/products/{$product->slug}/reviews")->assertJsonCount(0, 'data');
        $this->assertSame(0, $product->refresh()->rating_count);
    }

    public function test_editing_an_approved_review_sends_it_back_to_moderation(): void
    {
        [$user, $customer] = $this->customerUser();
        $product = Product::factory()->create();
        $this->deliverOneUnit($product->variations()->first(), $customer);

        $this->actingAs($user);
        $reviewId = $this->postJson("/api/v1/shop/products/{$product->slug}/reviews", [
            'rating' => 5,
            'comment' => 'Great.',
        ])->json('data.id');

        $this->actingAsRole('owner');
        $this->putJson("/api/v1/admin/reviews/{$reviewId}/status", ['status' => 'approved'])->assertOk();
        $this->assertSame(1, $product->refresh()->rating_count);

        $this->actingAs($user);
        $this->putJson("/api/v1/shop/products/{$product->slug}/reviews/{$reviewId}", [
            'rating' => 3,
            'comment' => 'Actually, mixed feelings after more use.',
        ])->assertOk()->assertJsonPath('data.status', 'pending');

        // No longer approved, so it drops back out of the public rating.
        $this->assertSame(0, $product->refresh()->rating_count);
    }

    public function test_a_customer_can_delete_their_own_review(): void
    {
        [$user, $customer] = $this->customerUser();
        $product = Product::factory()->create();
        $this->deliverOneUnit($product->variations()->first(), $customer);

        $this->actingAs($user);
        $reviewId = $this->postJson("/api/v1/shop/products/{$product->slug}/reviews", [
            'rating' => 5,
            'comment' => 'Great.',
        ])->json('data.id');

        $this->deleteJson("/api/v1/shop/products/{$product->slug}/reviews/{$reviewId}")->assertOk();

        $this->assertDatabaseMissing('product_reviews', ['id' => $reviewId]);
    }

    public function test_a_role_without_the_permission_cannot_moderate_reviews(): void
    {
        [$user, $customer] = $this->customerUser();
        $product = Product::factory()->create();
        $this->deliverOneUnit($product->variations()->first(), $customer);

        $this->actingAs($user);
        $reviewId = $this->postJson("/api/v1/shop/products/{$product->slug}/reviews", [
            'rating' => 5,
            'comment' => 'Great.',
        ])->json('data.id');

        $this->actingAsRole('accountant');
        $this->getJson('/api/v1/admin/reviews')->assertForbidden();
        $this->putJson("/api/v1/admin/reviews/{$reviewId}/status", ['status' => 'approved'])->assertForbidden();
    }
}
