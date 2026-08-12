<?php

declare(strict_types=1);

namespace Tests\Feature\Inventory;

use App\Enums\InventoryTransactionType;
use App\Exceptions\BusinessRuleException;
use App\Models\Inventory;
use App\Models\Product;
use App\Models\ProductVariation;
use App\Models\StockReservation;
use App\Services\Inventory\InventoryService;
use App\Services\Inventory\ReservationService;
use App\Services\Support\SettingsService;
use Database\Seeders\ChartOfAccountsSeeder;
use Database\Seeders\FiscalYearSeeder;
use Database\Seeders\UnitSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class StockReservationTest extends TestCase
{
    use RefreshDatabase;

    private ReservationService $reservations;

    private InventoryService $inventory;

    private ProductVariation $variation;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(UnitSeeder::class);
        $this->seed(ChartOfAccountsSeeder::class);
        $this->seed(FiscalYearSeeder::class);

        $this->reservations = app(ReservationService::class);
        $this->inventory = app(InventoryService::class);
        $this->variation = Product::factory()->create()->variations()->first();

        $this->inventory->receive($this->variation, '10', '1000.00', counterAccount: 'accounts_payable');
    }

    private function stock(): Inventory
    {
        return Inventory::where('product_variation_id', $this->variation->id)->firstOrFail();
    }

    public function test_reserving_reduces_what_is_available_but_not_what_is_on_hand(): void
    {
        $this->reservations->reserve($this->variation, '3', cartToken: 'cart-1');

        $stock = $this->stock();

        $this->assertSame('10.000', $stock->quantity);
        $this->assertSame('3.000', $stock->reserved_quantity);

        // available_quantity is a generated column, so it cannot disagree.
        $this->assertSame('7.000', $stock->available_quantity);
    }

    public function test_you_cannot_reserve_more_than_is_available(): void
    {
        $this->reservations->reserve($this->variation, '8', cartToken: 'cart-1');

        $this->expectException(BusinessRuleException::class);
        $this->expectExceptionMessageMatches('/Only 2 of/');

        $this->reservations->reserve($this->variation, '3', cartToken: 'cart-2');
    }

    /**
     * The gap that overselling lives in: reserved stock must not be sellable
     * to somebody else.
     */
    public function test_reserved_stock_cannot_be_sold_to_another_customer(): void
    {
        $this->reservations->reserve($this->variation, '9', cartToken: 'cart-1');

        $this->expectException(BusinessRuleException::class);
        $this->expectExceptionMessageMatches('/Not enough stock/');

        $this->inventory->issue($this->variation, '5', counterAccount: 'cogs');
    }

    /**
     * ...but the order that holds the reservation may draw against it, or it
     * could never ship its own goods.
     */
    public function test_the_holder_of_a_reservation_can_ship_against_it(): void
    {
        $reservation = $this->reservations->reserve($this->variation, '9', cartToken: 'cart-1');

        $movement = $this->inventory->issue(
            $this->variation, '9',
            InventoryTransactionType::TransitOut,
            counterAccount: 'goods_in_transit',
            allowReserved: true,
        );

        $this->reservations->consume($reservation);

        $this->assertSame('900.00', $movement->total_cost);
        $this->assertSame('1.000', $this->stock()->quantity);

        // Consumed reservations stop counting, or the units would be
        // deducted twice: once from quantity and once from available.
        $this->assertSame('0.000', $this->stock()->reserved_quantity);
        $this->assertSame('1.000', $this->stock()->available_quantity);
    }

    public function test_releasing_a_reservation_gives_the_stock_back(): void
    {
        $reservation = $this->reservations->reserve($this->variation, '4', cartToken: 'cart-1');

        $this->assertSame('6.000', $this->stock()->available_quantity);

        $this->reservations->release($reservation);

        $this->assertSame('10.000', $this->stock()->available_quantity);
        $this->assertSame('released', $reservation->fresh()->status);
    }

    /**
     * Without a TTL every abandoned checkout holds stock forever, and the
     * shop advertises itself as sold out with a full warehouse.
     */
    public function test_an_abandoned_checkout_releases_its_stock_when_it_expires(): void
    {
        app(SettingsService::class)->set('reservation_ttl_minutes', 30);

        $this->reservations->reserve($this->variation, '6', cartToken: 'cart-1');
        $this->assertSame('4.000', $this->stock()->available_quantity);

        $this->travel(31)->minutes();

        $released = $this->reservations->releaseExpired();

        $this->assertSame(1, $released);
        $this->assertSame('10.000', $this->stock()->available_quantity);
    }

    /**
     * A confirmed COD order is not an abandoned cart and must not have its
     * stock released out from under it.
     */
    public function test_an_indefinite_reservation_never_expires(): void
    {
        $this->reservations->reserve($this->variation, '5', orderId: 1, indefinite: true);

        $this->travel(30)->days();

        $this->assertSame(0, $this->reservations->releaseExpired());
        $this->assertSame('5.000', $this->stock()->reserved_quantity);
    }

    public function test_cancelling_an_order_releases_all_of_its_reservations(): void
    {
        $second = Product::factory()->create()->variations()->first();
        $this->inventory->receive($second, '5', '500.00', counterAccount: 'accounts_payable');

        $this->reservations->reserve($this->variation, '2', orderId: 77, indefinite: true);
        $this->reservations->reserve($second, '1', orderId: 77, indefinite: true);

        $this->reservations->releaseForOrder(77);

        $this->assertSame('0.000', $this->stock()->reserved_quantity);
        $this->assertSame(0, StockReservation::active()->count());
    }

    /**
     * The counter is a cache of the reservation rows. Invariant I4 checks it;
     * this repairs it.
     */
    public function test_reconcile_repairs_a_drifted_counter(): void
    {
        $this->reservations->reserve($this->variation, '3', cartToken: 'cart-1');

        // Simulate drift: something wrote the counter directly.
        Inventory::where('product_variation_id', $this->variation->id)
            ->update(['reserved_quantity' => '9.000']);

        $this->assertSame(1, $this->reservations->reconcileAll());
        $this->assertSame('3.000', $this->stock()->reserved_quantity);
        $this->assertSame(0, $this->reservations->reconcileAll());
    }

    public function test_reserving_zero_is_refused(): void
    {
        $this->expectException(BusinessRuleException::class);

        $this->reservations->reserve($this->variation, '0', cartToken: 'cart-1');
    }
}
