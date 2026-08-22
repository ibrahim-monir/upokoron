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
 * A cash-on-delivery order, from basket to settled cash.
 *
 * This is the test the rest of the accounting rests on. It checks the thing
 * that is easy to get wrong and expensive to discover late: that revenue and
 * cost are recognised at DELIVERY, not at shipping, and that a parcel which
 * comes back leaves the books exactly as it found them.
 */
class OrderLifecycleTest extends TestCase
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

    public function test_placing_an_order_totals_it_from_the_catalogue(): void
    {
        $order = $this->placeOrder('2');

        $this->assertSame('2000.00', $order->subtotal);
        $this->assertSame('60.00', $order->shipping_charge);
        $this->assertSame('2060.00', $order->total);
        $this->assertSame(OrderStatus::Pending, $order->status);
        $this->assertMatchesRegularExpression('/^\d{8}$/', $order->number);
    }

    public function test_placing_an_order_posts_nothing_to_the_ledger(): void
    {
        // An order is a promise, not a transaction. On COD a real share of
        // them never become revenue at all.
        $this->placeOrder();

        $this->assertSame(
            0,
            JournalEntry::where('event', 'like', 'order.%')->count(),
        );
    }

    public function test_the_cart_becomes_the_order_and_keeps_holding_the_stock(): void
    {
        $order = $this->placeOrder('3');

        $cart = Cart::findOrFail($order->cart_id);
        $stock = Inventory::where('product_variation_id', $this->variation->id)->sole();

        $this->assertSame('converted', $cart->status);
        $this->assertSame('10.000', $stock->quantity);
        $this->assertSame('3.000', $stock->reserved_quantity);

        // The hold no longer expires: a placed order's stock is spoken for
        // until it ships or is cancelled, not for the next thirty minutes.
        $this->assertNull($order->cart_id === null ? null : \App\Models\StockReservation::where('order_id', $order->id)->sole()->expires_at);
    }

    public function test_shipping_moves_stock_to_goods_in_transit_at_cost_and_not_to_sales(): void
    {
        $order = $this->placeOrder('2');

        $this->advanceTo($order, OrderStatus::Shipped);

        $order->refresh();
        $stock = Inventory::where('product_variation_id', $this->variation->id)->sole();

        // Two units at ৳500 left the shelf.
        $this->assertSame('8.000', $stock->quantity);
        $this->assertSame('0.000', $stock->reserved_quantity);
        $this->assertSame('1000.00', $order->cost_total);

        $this->assertSame('1000.00', $this->balance('goods_in_transit')->value());

        // Nothing is a sale yet.
        $this->assertSame('0.00', $this->balance('sales_revenue')->value());
        $this->assertSame('0.00', $this->balance('cogs')->value());
    }

    public function test_the_cost_is_frozen_on_the_line_when_it_ships(): void
    {
        $order = $this->placeOrder('2');

        $statuses = app(OrderStatusService::class);
        $this->advanceTo($order, OrderStatus::Shipped);

        $item = $order->refresh()->items->sole();

        $this->assertSame('500.000000', $item->unit_cost);
        $this->assertSame('1000.00', $item->total_cost);

        // A later purchase at a different price moves the average, and must
        // not touch what this sale cost.
        app(InventoryService::class)->receive(
            $this->variation, '10', '9000.00', counterAccount: 'accounts_payable',
        );

        $this->assertSame('500.000000', $item->refresh()->unit_cost);
    }

    public function test_delivery_recognises_revenue_and_cost_together(): void
    {
        $order = $this->placeOrder('2');

        $this->advanceTo($order, OrderStatus::Delivered);

        $this->assertSame('2000.00', $this->balance('sales_revenue')->negated()->value());
        $this->assertSame('60.00', $this->balance('shipping_income')->negated()->value());
        $this->assertSame('1000.00', $this->balance('cogs')->value());

        // The goods have arrived, so Goods in Transit is empty again.
        $this->assertSame('0.00', $this->balance('goods_in_transit')->value());

        // The courier has the money and has not handed it over yet.
        $this->assertSame('2060.00', $this->balance('cod_receivable')->value());
    }

    public function test_collecting_the_cash_clears_the_receivable_without_a_second_sale(): void
    {
        $order = $this->placeOrder('2');

        $this->advanceTo($order, OrderStatus::Delivered);

        app(PaymentService::class)->record($order->refresh(), '2060.00');

        $order->refresh();

        $this->assertSame('2060.00', $order->paid_total);
        $this->assertSame(PaymentStatus::Paid, $order->payment_status);

        $this->assertSame('2060.00', $this->balance('cash_in_hand')->value());
        $this->assertSame('0.00', $this->balance('cod_receivable')->value());

        // Still one sale, not two.
        $this->assertSame('2000.00', $this->balance('sales_revenue')->negated()->value());
    }

    public function test_a_returned_parcel_puts_the_stock_back_at_the_cost_it_left_with(): void
    {
        $order = $this->placeOrder('2');

        $statuses = app(OrderStatusService::class);
        $this->advanceTo($order, OrderStatus::Shipped);
        $statuses->transition($order->refresh(), OrderStatus::Returned);

        $stock = Inventory::where('product_variation_id', $this->variation->id)->sole();

        $this->assertSame('10.000', $stock->quantity);
        $this->assertSame('5000.00', $stock->stock_value);

        // Nothing was ever earned, and Goods in Transit is clear.
        $this->assertSame('0.00', $this->balance('goods_in_transit')->value());
        $this->assertSame('0.00', $this->balance('sales_revenue')->value());
        $this->assertSame('0.00', $this->balance('cogs')->value());
    }

    /**
     * The admin list carries the moves each order is allowed to make.
     *
     * The status dropdown in the orders table is built entirely from this
     * field -- it never guesses, so it can never offer an illegal move. If
     * the field were ever trimmed out of the payload the control would go
     * quietly read-only instead of failing, which is why it is pinned here.
     */
    public function test_the_admin_list_offers_only_the_moves_an_order_may_make(): void
    {
        $order = $this->placeOrder();

        $this->actingAsRole('owner');

        $this->getJson('/api/v1/admin/orders')
            ->assertOk()
            ->assertJsonPath('data.0.number', $order->number)
            ->assertJsonPath('data.0.status', 'pending')
            ->assertJsonPath('data.0.next_statuses.0.value', 'confirmed')
            ->assertJsonPath('data.0.next_statuses.1.value', 'on_hold')
            ->assertJsonPath('data.0.next_statuses.2.value', 'cancelled')
            ->assertJsonCount(3, 'data.0.next_statuses');
    }

    public function test_a_finished_order_offers_no_moves_at_all(): void
    {
        $order = $this->placeOrder();

        $statuses = app(OrderStatusService::class);
        $statuses->transition($order, OrderStatus::Confirmed);
        $statuses->transition($order->refresh(), OrderStatus::Cancelled);

        $this->actingAsRole('owner');

        $this->getJson('/api/v1/admin/orders')
            ->assertOk()
            ->assertJsonPath('data.0.status', 'cancelled')
            ->assertJsonCount(0, 'data.0.next_statuses');
    }

    public function test_the_whole_forward_path_walks_end_to_end(): void
    {
        $order = $this->placeOrder();

        $seen = [];

        foreach (self::HAPPY_PATH as $step) {
            $order = app(OrderStatusService::class)->transition($order->refresh(), $step);
            $seen[] = $order->status->value;
        }

        $this->assertSame([
            'confirmed', 'processing', 'packed', 'ready_to_ship',
            'shipped', 'out_for_delivery', 'delivered',
        ], $seen);
    }

    /**
     * The steps that were added to describe where a parcel is must not
     * become steps that move money. Only Shipped and Delivered post.
     */
    public function test_the_new_fulfilment_steps_post_nothing_to_the_ledger(): void
    {
        $order = $this->placeOrder();
        $statuses = app(OrderStatusService::class);

        $before = \App\Models\JournalEntry::count();

        $statuses->transition($order, OrderStatus::Confirmed);
        $statuses->transition($order->refresh(), OrderStatus::Processing);
        $statuses->transition($order->refresh(), OrderStatus::Packed);
        $statuses->transition($order->refresh(), OrderStatus::ReadyToShip);

        $this->assertSame($before, \App\Models\JournalEntry::count());

        // Shipped does post -- stock moves to Goods in Transit at cost.
        $statuses->transition($order->refresh(), OrderStatus::Shipped);
        $afterShipping = \App\Models\JournalEntry::count();
        $this->assertGreaterThan($before, $afterShipping);

        // The last mile does not: the goods left when it shipped.
        $statuses->transition($order->refresh(), OrderStatus::OutForDelivery);
        $this->assertSame($afterShipping, \App\Models\JournalEntry::count());
    }

    public function test_a_held_order_keeps_holding_its_stock(): void
    {
        $order = $this->placeOrder('4');

        app(OrderStatusService::class)->transition($order, OrderStatus::OnHold);

        $stock = Inventory::where('product_variation_id', $this->variation->id)->sole();

        // Parked, not released. Letting the hold go would allow the same
        // four units to be sold to somebody else while this order waits.
        $this->assertSame('4.000', $stock->reserved_quantity);
        $this->assertSame('6.000', $stock->available_quantity);
    }

    public function test_a_held_order_resumes_as_confirmed(): void
    {
        $order = $this->placeOrder();
        $statuses = app(OrderStatusService::class);

        $statuses->transition($order, OrderStatus::OnHold);
        $order = $statuses->transition($order->refresh(), OrderStatus::Confirmed);

        $this->assertSame(OrderStatus::Confirmed, $order->status);
    }

    public function test_an_order_cannot_skip_a_fulfilment_step(): void
    {
        $order = $this->placeOrder();

        app(OrderStatusService::class)->transition($order, OrderStatus::Confirmed);

        // Packing is now preceded by picking, so this jump is refused.
        $this->expectExceptionMessageMatches('/cannot be marked Packed/');

        app(OrderStatusService::class)->transition($order->refresh(), OrderStatus::Packed);
    }

    public function test_an_order_out_for_delivery_cannot_be_cancelled(): void
    {
        $order = $this->placeOrder();

        $this->advanceTo($order, OrderStatus::OutForDelivery);

        $this->expectExceptionMessageMatches('/cannot be marked Cancelled/');

        app(OrderStatusService::class)->transition($order->refresh(), OrderStatus::Cancelled);
    }

    public function test_an_order_cannot_skip_from_pending_to_delivered(): void
    {
        $order = $this->placeOrder();

        $this->expectExceptionMessageMatches('/cannot be marked Delivered/');

        app(OrderStatusService::class)->transition($order, OrderStatus::Delivered);
    }

    public function test_a_shipped_order_cannot_be_cancelled(): void
    {
        $order = $this->placeOrder();

        $statuses = app(OrderStatusService::class);
        $this->advanceTo($order, OrderStatus::Shipped);

        // The goods are out. It either arrives or comes back.
        $this->expectExceptionMessageMatches('/cannot be marked Cancelled/');

        $statuses->transition($order->refresh(), OrderStatus::Cancelled);
    }

    public function test_cancelling_before_shipment_gives_the_stock_back(): void
    {
        $order = $this->placeOrder('4');

        app(OrderStatusService::class)->transition($order, OrderStatus::Cancelled, note: 'Customer changed their mind');

        $stock = Inventory::where('product_variation_id', $this->variation->id)->sole();

        $this->assertSame('10.000', $stock->quantity);
        $this->assertSame('0.000', $stock->reserved_quantity);
        $this->assertSame('10.000', $stock->available_quantity);
    }

    public function test_a_payment_cannot_exceed_what_is_owed(): void
    {
        $order = $this->placeOrder('2');

        $this->advanceTo($order, OrderStatus::Delivered);

        $this->expectExceptionMessageMatches('/more than the/');

        app(PaymentService::class)->record($order->refresh(), '5000.00');
    }

    public function test_delivering_twice_does_not_post_the_sale_twice(): void
    {
        $order = $this->placeOrder('2');

        $this->advanceTo($order, OrderStatus::Delivered);

        // Delivered is terminal, so the second attempt is refused outright --
        // but the ledger guard behind it matters more than the status guard.
        try {
            $statuses->transition($order->refresh(), OrderStatus::Delivered);
        } catch (\Throwable) {
            // expected
        }

        $this->assertSame(1, JournalEntry::where('event', 'order.delivered')->count());
        $this->assertSame('2000.00', $this->balance('sales_revenue')->negated()->value());
    }

    public function test_the_books_balance_after_the_whole_lifecycle(): void
    {
        $order = $this->placeOrder('2');

        $this->advanceTo($order, OrderStatus::Delivered);

        app(PaymentService::class)->record($order->refresh(), '2060.00');

        $debit = (string) (\App\Models\JournalEntryLine::sum('debit') ?: '0');
        $credit = (string) (\App\Models\JournalEntryLine::sum('credit') ?: '0');

        $this->assertSame(
            Money::of($debit)->value(),
            Money::of($credit)->value(),
            'Total debits must equal total credits.',
        );
    }
}
