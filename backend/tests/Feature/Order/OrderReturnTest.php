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
 * Returns: asked for by the customer, approved, received back onto the
 * shelf at the cost the goods left at, and refunded.
 */
class OrderReturnTest extends TestCase
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

    public function test_a_delivered_order_goes_back_on_the_shelf_and_is_refunded(): void
    {
        $order = $this->advanceTo($this->placeOrder('2'), OrderStatus::Delivered);
        app(PaymentService::class)->record($order, $order->total);
        $item = $order->items()->sole();

        // The customer asks, by the delivery phone number.
        $this->postJson("/api/v1/shop/orders/{$order->number}/returns", [
            'phone' => '01712345678',
            'items' => [['order_item_id' => $item->id, 'quantity' => 1]],
            'reason' => 'faulty',
        ])->assertCreated();

        // Only one of the two is left to ask for now.
        $this->postJson("/api/v1/shop/orders/{$order->number}/returns", [
            'phone' => '01712345678',
            'items' => [['order_item_id' => $item->id, 'quantity' => 2]],
            'reason' => 'faulty',
        ])->assertStatus(409);

        $return = \App\Models\OrderReturn::sole();
        $this->actingAsRole('owner');

        $this->postJson("/api/v1/admin/returns/{$return->id}/approve")->assertOk();
        $this->postJson("/api/v1/admin/returns/{$return->id}/receive", [
            'items' => [['id' => $return->items()->sole()->id, 'restock' => true]],
        ])->assertOk();

        // 10 bought in, 2 sold, 1 back.
        $this->assertSame('9.000', Inventory::where('product_variation_id', $this->variation->id)->sole()->quantity);
        $this->assertSame('1.000', $item->refresh()->quantity_returned);
        $this->assertSame('1000.00', $return->refresh()->refund_amount);

        $this->postJson("/api/v1/admin/returns/{$return->id}/refund")->assertOk();

        $this->assertSame('refunded', $return->refresh()->status->value);
        $this->assertSame('1000.00', $order->refresh()->refunded_total);

        $debit = (string) \App\Models\JournalEntryLine::sum('debit');
        $credit = (string) \App\Models\JournalEntryLine::sum('credit');
        $this->assertSame(Money::of($debit)->value(), Money::of($credit)->value());
    }

    public function test_an_order_not_yet_delivered_cannot_be_returned(): void
    {
        $order = $this->placeOrder('1');

        $this->postJson("/api/v1/shop/orders/{$order->number}/returns", [
            'phone' => '01712345678',
            'items' => [['order_item_id' => $order->items()->sole()->id, 'quantity' => 1]],
            'reason' => 'faulty',
        ])->assertStatus(409);
    }
}
