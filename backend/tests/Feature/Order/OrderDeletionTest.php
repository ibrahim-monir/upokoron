<?php

declare(strict_types=1);

namespace Tests\Feature\Order;

use App\Enums\OrderStatus;
use App\Enums\PaymentStatus;
use App\Models\Cart;
use App\Models\Customer;
use App\Models\Inventory;
use App\Models\JournalEntry;
use App\Models\Order;
use App\Models\PaymentMethod;
use App\Models\Product;
use App\Models\ProductVariation;
use App\Models\ShippingRate;
use App\Services\Cart\CartService;
use App\Services\Inventory\InventoryService;
use App\Services\Order\OrderService;
use App\Services\Order\OrderStatusService;
use App\Services\Order\PaymentService;
use App\Services\Order\PlaceOrderData;
use App\Services\Shipping\ShippingService;
use App\Support\Money;
use Database\Seeders\ChartOfAccountsSeeder;
use Database\Seeders\FiscalYearSeeder;
use Database\Seeders\PaymentMethodSeeder;
use Database\Seeders\ShippingZoneSeeder;
use Database\Seeders\UnitSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Deleting test orders: allowed only while an order has touched neither the
 * stock records nor the ledger, and everything it held is handed back.
 */
class OrderDeletionTest extends TestCase
{
    use RefreshDatabase;

    private ProductVariation $variation;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(UnitSeeder::class);
        $this->seed(ChartOfAccountsSeeder::class);
        $this->seed(FiscalYearSeeder::class);
        $this->seed(ShippingZoneSeeder::class);
        $this->seed(PaymentMethodSeeder::class);

        $this->variation = Product::factory()->create()->variations()->first();
        $this->variation->forceFill(['selling_price' => '1000.00'])->save();

        // 10 units for ৳5,000 -- ৳500 each.
        app(InventoryService::class)->receive(
            $this->variation, '10', '5000.00', counterAccount: 'accounts_payable',
        );
    }

    private function balance(string $systemKey): Money
    {
        $account = \App\Models\Account::where('system_key', $systemKey)->sole();

        $debit = (string) (\App\Models\JournalEntryLine::where('account_id', $account->id)->sum('debit') ?: '0');
        $credit = (string) (\App\Models\JournalEntryLine::where('account_id', $account->id)->sum('credit') ?: '0');

        return Money::of($debit)->minus(Money::of($credit));
    }

    /**
     * The forward path an order takes when nothing goes wrong.
     *
     * Several of these steps -- processing, ready to ship, out for delivery
     * -- post nothing and exist only to say where the parcel physically is.
     * A test about the ledger should not have to name them, and should not
     * need editing the next time one is added between two others.
     */
    private const HAPPY_PATH = [
        OrderStatus::Confirmed,
        OrderStatus::Processing,
        OrderStatus::Packed,
        OrderStatus::ReadyToShip,
        OrderStatus::Shipped,
        OrderStatus::OutForDelivery,
        OrderStatus::Delivered,
    ];

    /** Walk an order up the happy path and stop when it reaches $target. */
    private function advanceTo(Order $order, OrderStatus $target): Order
    {
        $statuses = app(OrderStatusService::class);

        foreach (self::HAPPY_PATH as $step) {
            $order = $statuses->transition($order->refresh(), $step);

            if ($step === $target) {
                break;
            }
        }

        return $order->refresh();
    }

    private function placeOrder(string $quantity = '2', string $methodCode = 'cod'): Order
    {
        $customer = Customer::factory()->create();
        $carts = app(CartService::class);

        $cart = $carts->resolve(null, $customer);
        $carts->add($cart, $this->variation, $quantity);

        $zone = app(ShippingService::class)->zoneFor('Dhaka', 'Dhaka');

        return app(OrderService::class)->placeFromCart(
            cart: $cart,
            data: new PlaceOrderData(
                shippingRate: ShippingRate::where('shipping_zone_id', $zone->id)->sole(),
                paymentMethod: PaymentMethod::where('code', $methodCode)->sole(),
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
    }

    public function test_an_unshipped_order_can_be_deleted_and_its_stock_and_coupon_come_back(): void
    {
        $order = $this->placeOrder('3');
        $coupon = new \App\Models\Coupon;
        $coupon->forceFill(['code' => 'TEST10', 'type' => 'fixed', 'value' => '10.00', 'used_count' => 1])->save();
        $order->forceFill(['coupon_id' => $coupon->id])->save();

        $this->actingAsRole('owner');

        $this->getJson("/api/v1/admin/orders/{$order->id}")
            ->assertOk()
            ->assertJsonPath('data.delete_blocker', null);

        $this->deleteJson("/api/v1/admin/orders/{$order->id}")->assertOk();

        $this->assertDatabaseMissing('orders', ['id' => $order->id]);
        $this->assertDatabaseMissing('order_items', ['order_id' => $order->id]);
        $this->assertDatabaseMissing('stock_reservations', ['order_id' => $order->id]);
        $this->assertSame('0.000', Inventory::where('product_variation_id', $this->variation->id)->sole()->reserved_quantity);
        $this->assertSame(0, $coupon->refresh()->used_count);
    }

    public function test_a_cancelled_order_can_be_deleted(): void
    {
        $order = $this->placeOrder();
        app(OrderStatusService::class)->transition($order, OrderStatus::Cancelled);

        $this->actingAsRole('owner');

        $this->deleteJson("/api/v1/admin/orders/{$order->id}")->assertOk();
        $this->assertDatabaseMissing('orders', ['id' => $order->id]);
    }

    public function test_a_shipped_order_cannot_be_deleted(): void
    {
        $order = $this->advanceTo($this->placeOrder(), OrderStatus::Shipped);

        $this->actingAsRole('owner');

        $this->getJson("/api/v1/admin/orders/{$order->id}")
            ->assertJsonPath('data.delete_blocker', fn ($reason) => is_string($reason));

        $this->deleteJson("/api/v1/admin/orders/{$order->id}")->assertStatus(409);
        $this->assertDatabaseHas('orders', ['id' => $order->id]);
    }

    public function test_an_order_with_money_recorded_cannot_be_deleted(): void
    {
        $order = $this->placeOrder();
        app(PaymentService::class)->record($order, '100.00');

        $this->actingAsRole('owner');

        $this->deleteJson("/api/v1/admin/orders/{$order->id}")->assertStatus(409);
        $this->assertDatabaseHas('orders', ['id' => $order->id]);
    }

    public function test_deleting_needs_its_own_permission(): void
    {
        $order = $this->placeOrder();

        $this->actingAsRole('manager');

        $this->deleteJson("/api/v1/admin/orders/{$order->id}")->assertForbidden();
        $this->assertDatabaseHas('orders', ['id' => $order->id]);
    }
}
