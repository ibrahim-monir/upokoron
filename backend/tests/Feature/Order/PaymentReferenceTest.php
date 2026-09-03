<?php

declare(strict_types=1);

namespace Tests\Feature\Order;

use App\Enums\PaymentStatus;
use App\Models\Customer;
use App\Models\Order;
use App\Models\PaymentMethod;
use App\Models\Product;
use App\Models\ProductVariation;
use App\Models\ShippingRate;
use App\Services\Cart\CartService;
use App\Services\Inventory\InventoryService;
use App\Services\Order\OrderService;
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
 * The transaction id a customer gives after sending money themselves.
 *
 * The whole point of these tests is the line between a claim and a payment.
 * Anyone holding the order number and the delivery phone can type an id into
 * this endpoint; none of them may thereby mark the order paid, move its
 * balance, or put a line in the ledger. Only the shop does that, by hand,
 * after finding the id on its own statement.
 */
class PaymentReferenceTest extends TestCase
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

        app(InventoryService::class)->receive(
            $this->variation, '10', '5000.00', counterAccount: 'accounts_payable',
        );
    }

    private function placeOrder(string $methodCode = 'bkash', ?string $reference = null): Order
    {
        $customer = Customer::factory()->create();
        $carts = app(CartService::class);

        $cart = $carts->resolve(null, $customer);
        $carts->add($cart, $this->variation, '1');

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
                paymentReference: $reference,
            ),
            customer: $customer,
        );
    }

    public function test_a_transaction_id_given_at_checkout_is_kept_on_the_order(): void
    {
        $order = $this->placeOrder('bkash', '9F4KJ2XY7B');

        $this->assertSame('9F4KJ2XY7B', $order->payment_reference);
        $this->assertNotNull($order->payment_reference_at);

        // A claim, not money.
        $this->assertSame(PaymentStatus::Unpaid, $order->payment_status);
        $this->assertSame('0.00', $order->paid_total);
    }

    public function test_a_transaction_id_is_ignored_on_cash_on_delivery(): void
    {
        $order = $this->placeOrder('cod', '9F4KJ2XY7B');

        $this->assertNull($order->payment_reference);
    }

    public function test_the_buyer_can_submit_a_transaction_id_after_placing_the_order(): void
    {
        $order = $this->placeOrder('bkash');

        $this->postJson("/api/v1/shop/orders/{$order->number}/payment-reference", [
            'payment_reference' => '  9F4KJ2XY7B  ',
            'phone' => '01712345678',
        ])->assertOk();

        $order->refresh();

        $this->assertSame('9F4KJ2XY7B', $order->payment_reference);
        $this->assertSame(PaymentStatus::Unpaid, $order->payment_status);
        $this->assertSame('0.00', $order->paid_total);
        $this->assertCount(0, $order->payments);
    }

    public function test_a_typo_can_be_corrected(): void
    {
        $order = $this->placeOrder('bkash', 'WRONG1');

        $this->postJson("/api/v1/shop/orders/{$order->number}/payment-reference", [
            'payment_reference' => 'RIGHT2',
            'phone' => '01712345678',
        ])->assertOk();

        $this->assertSame('RIGHT2', $order->refresh()->payment_reference);
    }

    public function test_a_stranger_without_the_delivery_phone_cannot_write_to_the_order(): void
    {
        $order = $this->placeOrder('bkash');

        $this->postJson("/api/v1/shop/orders/{$order->number}/payment-reference", [
            'payment_reference' => 'MADEUP',
        ])->assertForbidden();

        $this->postJson("/api/v1/shop/orders/{$order->number}/payment-reference", [
            'payment_reference' => 'MADEUP',
            'phone' => '01799999999',
        ])->assertNotFound();

        $this->assertNull($order->refresh()->payment_reference);
    }

    public function test_a_cash_on_delivery_order_has_no_transaction_id_to_give(): void
    {
        $order = $this->placeOrder('cod');

        $this->postJson("/api/v1/shop/orders/{$order->number}/payment-reference", [
            'payment_reference' => '9F4KJ2XY7B',
            'phone' => '01712345678',
        ])->assertStatus(422);

        $this->assertNull($order->refresh()->payment_reference);
    }
}
