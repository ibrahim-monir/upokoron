<?php

declare(strict_types=1);

namespace Tests\Feature\Cart;

use App\Models\Cart;
use App\Models\Customer;
use App\Models\CustomerGroup;
use App\Models\Inventory;
use App\Models\Product;
use App\Models\ProductVariation;
use App\Models\ShippingZoneArea;
use App\Services\Cart\CartService;
use App\Services\Inventory\InventoryService;
use App\Services\Pricing\PricingService;
use App\Services\Shipping\ShippingService;
use App\Support\Money;
use Database\Seeders\ChartOfAccountsSeeder;
use Database\Seeders\FiscalYearSeeder;
use Database\Seeders\ShippingZoneSeeder;
use Database\Seeders\UnitSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The parts of the basket that decide money and stock.
 *
 * Deliberately narrow: pricing authority, that adding to a cart really holds
 * inventory, and that delivery is charged by the right zone. Those three are
 * where a mistake costs the shop actual money rather than a redraw.
 */
class CartAndPricingTest extends TestCase
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

        $this->variation = Product::factory()->create()->variations()->first();
        $this->variation->forceFill(['selling_price' => '1000.00'])->save();

        app(InventoryService::class)->receive(
            $this->variation, '10', '5000.00', counterAccount: 'accounts_payable',
        );
    }

    private function cart(): Cart
    {
        return app(CartService::class)->resolve(null);
    }

    public function test_the_price_comes_from_the_catalogue_not_the_caller(): void
    {
        $line = app(PricingService::class)->price($this->variation, '2');

        $this->assertSame('1000.00', $line->unitPrice->value());
        $this->assertSame('2000.00', $line->lineTotal->value());
        $this->assertNull($line->discountReason);
    }

    public function test_an_active_special_price_replaces_the_list_price(): void
    {
        $this->variation->forceFill([
            'special_price' => '800.00',
            'special_starts_at' => now()->subDay(),
            'special_ends_at' => now()->addDay(),
        ])->save();

        $line = app(PricingService::class)->price($this->variation->refresh(), '1');

        $this->assertSame('800.00', $line->unitPrice->value());
        $this->assertSame('200.00', $line->unitDiscount->value());
        $this->assertSame('special', $line->discountReason);
    }

    public function test_an_expired_special_price_is_ignored(): void
    {
        $this->variation->forceFill([
            'special_price' => '800.00',
            'special_starts_at' => now()->subDays(5),
            'special_ends_at' => now()->subDay(),
        ])->save();

        $line = app(PricingService::class)->price($this->variation->refresh(), '1');

        $this->assertSame('1000.00', $line->unitPrice->value());
    }

    public function test_a_group_discount_stacks_on_top_of_a_special(): void
    {
        // A wholesale customer must not pay MORE during a sale than their
        // standing agreement gives them the rest of the year.
        $this->variation->forceFill([
            'special_price' => '800.00',
            'special_starts_at' => now()->subDay(),
        ])->save();

        $group = CustomerGroup::create([
            'name' => 'Wholesale', 'slug' => 'wholesale',
            'discount_percent' => '10.00', 'is_active' => true,
        ]);

        $customer = Customer::factory()->create(['customer_group_id' => $group->id]);

        $line = app(PricingService::class)->price($this->variation->refresh(), '2', $customer);

        $this->assertSame('720.00', $line->unitPrice->value());
        $this->assertSame('1440.00', $line->lineTotal->value());
        $this->assertSame('special+group', $line->discountReason);
    }

    public function test_the_unit_price_always_divides_back_into_the_line_total(): void
    {
        // Rounding at the unit and multiplying up, rather than discounting the
        // line, is what keeps an invoice adding up to itself.
        $this->variation->forceFill(['selling_price' => '333.33'])->save();

        $group = CustomerGroup::create([
            'name' => 'Staff', 'slug' => 'staff',
            'discount_percent' => '7.50', 'is_active' => true,
        ]);

        $line = app(PricingService::class)->price(
            $this->variation->refresh(), '7',
            Customer::factory()->create(['customer_group_id' => $group->id]),
        );

        $this->assertSame(
            $line->unitPrice->times('7')->value(),
            $line->lineTotal->value(),
        );
    }

    public function test_adding_to_the_cart_holds_the_stock(): void
    {
        $cart = $this->cart();

        app(CartService::class)->add($cart, $this->variation, '3');

        $stock = Inventory::where('product_variation_id', $this->variation->id)->sole();

        $this->assertSame('10.000', $stock->quantity);
        $this->assertSame('3.000', $stock->reserved_quantity);
        $this->assertSame('7.000', $stock->available_quantity);
    }

    public function test_the_cart_cannot_hold_more_than_exists(): void
    {
        $cart = $this->cart();

        $this->expectExceptionMessageMatches('/Only 10 of/');

        app(CartService::class)->add($cart, $this->variation, '11');
    }

    public function test_adding_the_same_item_twice_makes_one_line(): void
    {
        $carts = app(CartService::class);
        $cart = $this->cart();

        $carts->add($cart, $this->variation, '2');
        $carts->add($cart, $this->variation, '3');

        $this->assertSame(1, $cart->items()->count());
        $this->assertSame('5.000', $cart->items()->sole()->quantity);

        // The hold moved with it rather than stacking two reservations.
        $stock = Inventory::where('product_variation_id', $this->variation->id)->sole();
        $this->assertSame('5.000', $stock->reserved_quantity);
    }

    public function test_removing_a_line_gives_the_stock_back(): void
    {
        $carts = app(CartService::class);
        $cart = $this->cart();

        $item = $carts->add($cart, $this->variation, '4');
        $carts->remove($cart, $item->load('reservation'));

        $stock = Inventory::where('product_variation_id', $this->variation->id)->sole();

        $this->assertSame('0.000', $stock->reserved_quantity);
        $this->assertSame('10.000', $stock->available_quantity);
    }

    public function test_the_cart_stores_no_prices_so_a_price_change_shows_immediately(): void
    {
        $carts = app(CartService::class);
        $cart = $this->cart();

        $carts->add($cart, $this->variation, '2');

        $this->assertSame('2000.00', $carts->summary($cart)['subtotal']->value());

        $this->variation->forceFill(['selling_price' => '900.00'])->save();

        $this->assertSame('1800.00', $carts->summary($cart->refresh())['subtotal']->value());
    }

    public function test_delivery_is_charged_by_the_most_specific_area(): void
    {
        $shipping = app(ShippingService::class);

        $this->assertSame('inside-dhaka-city', $shipping->zoneFor('Dhaka', 'Dhaka')->slug);
        $this->assertSame('dhaka-district', $shipping->zoneFor('Dhaka', 'Savar')->slug);
        $this->assertSame('dhaka-district', $shipping->zoneFor('Dhaka')->slug);
    }

    public function test_a_renamed_district_still_finds_its_zone(): void
    {
        // Half the country still writes Jessore and Comilla. Matching those
        // as strangers would quote them the most distant delivery charge for
        // an address the shop covers.
        $shipping = app(ShippingService::class);

        ShippingZoneArea::create([
            'shipping_zone_id' => $shipping->zoneFor('Dhaka', 'Dhaka')->id,
            'district' => 'Jashore',
            'city' => null,
        ]);

        $this->assertSame('inside-dhaka-city', $shipping->zoneFor('Jessore')->slug);
        $this->assertSame('inside-dhaka-city', $shipping->zoneFor('JESSORE')->slug);
    }

    public function test_an_unlisted_district_falls_back_rather_than_failing(): void
    {
        // No quote at all means the customer cannot check out, and the lost
        // sale leaves no trace anywhere.
        $zone = app(ShippingService::class)->zoneFor('Rangamati');

        $this->assertTrue($zone->is_fallback);
    }

    public function test_free_delivery_is_decided_on_the_subtotal_alone(): void
    {
        $shipping = app(ShippingService::class);
        $zone = $shipping->zoneFor('Dhaka', 'Dhaka');

        $under = $shipping->quote($zone, Money::of('2999.99'));
        $over = $shipping->quote($zone, Money::of('3000.00'));

        $this->assertSame('60.00', $under[0]['charge']);
        $this->assertSame('0.00', $over[0]['charge']);
        $this->assertTrue($over[0]['is_free']);
    }
}
