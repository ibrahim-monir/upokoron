<?php

declare(strict_types=1);

namespace Tests\Feature\Inventory;

use App\Models\Product;
use App\Models\ProductVariation;
use App\Services\Inventory\InventoryService;
use Database\Seeders\ChartOfAccountsSeeder;
use Database\Seeders\FiscalYearSeeder;
use Database\Seeders\UnitSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The inventory screens, exercised over HTTP.
 *
 * The service layer was covered from the start; these endpoints were not, and
 * the gap hid a live 500: the stock summary aliased a COUNT as `lines`, which
 * MySQL reserves for LOAD DATA. Every service test passed while the admin
 * inventory page was broken, because nothing ever issued the request.
 */
class InventoryApiTest extends TestCase
{
    use RefreshDatabase;

    private ProductVariation $variation;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(UnitSeeder::class);
        $this->seed(ChartOfAccountsSeeder::class);
        $this->seed(FiscalYearSeeder::class);

        $this->variation = Product::factory()->create()->variations()->first();

        app(InventoryService::class)->receive(
            $this->variation, '10', '1000.00', counterAccount: 'accounts_payable',
        );
    }

    public function test_the_stock_list_returns_rows_and_a_summary(): void
    {
        $this->actingAsRole('owner');

        $this->getJson('/api/v1/admin/inventory')
            ->assertOk()
            ->assertJsonPath('data.0.product_variation_id', $this->variation->id)
            ->assertJsonPath('data.0.quantity', '10.000')
            ->assertJsonPath('summary.tracked_items', 1)
            // receive() takes the TOTAL cost, not a unit cost: 10 units for
            // ৳1,000 is ৳100 each.
            ->assertJsonPath('summary.stock_value', '1000.00')
            ->assertJsonPath('data.0.average_cost', '100.000000')
            ->assertJsonPath('summary.out_of_stock', 0);
    }

    public function test_the_summary_counts_items_that_are_out_of_stock(): void
    {
        app(InventoryService::class)->issue($this->variation, '10');

        $this->actingAsRole('owner');

        $this->getJson('/api/v1/admin/inventory')
            ->assertOk()
            ->assertJsonPath('summary.tracked_items', 1)
            ->assertJsonPath('summary.out_of_stock', 1)
            // Selling every unit takes the remaining value with it, so the
            // shelf is empty and worth nothing -- not empty and still valued.
            ->assertJsonPath('summary.stock_value', '0.00');
    }

    public function test_the_summary_counts_items_below_their_reorder_level(): void
    {
        $this->actingAsRole('owner');

        $this->putJson("/api/v1/admin/inventory/{$this->variation->id}/levels", [
            'reorder_level' => '25',
        ])->assertOk();

        $this->getJson('/api/v1/admin/inventory')
            ->assertOk()
            ->assertJsonPath('summary.low_stock', 1);
    }

    public function test_filters_narrow_the_list(): void
    {
        $this->actingAsRole('owner');

        $this->getJson('/api/v1/admin/inventory?filter=in')->assertOk()->assertJsonCount(1, 'data');
        $this->getJson('/api/v1/admin/inventory?filter=out')->assertOk()->assertJsonCount(0, 'data');
    }

    public function test_movements_list_the_ledger_behind_a_variation(): void
    {
        $this->actingAsRole('owner');

        $this->getJson("/api/v1/admin/inventory/{$this->variation->id}/movements")
            ->assertOk()
            ->assertJsonPath('variation.id', $this->variation->id)
            ->assertJsonPath('data.0.quantity', '10.000')
            ->assertJsonPath('data.0.quantity_after', '10.000');
    }

    public function test_the_valuation_report_loads(): void
    {
        $this->actingAsRole('owner');

        $this->getJson('/api/v1/admin/inventory/valuation')->assertOk();
    }

    public function test_support_can_see_stock_but_not_change_it(): void
    {
        // Support answers "is this in stock?" all day, so they can read the
        // list. Correcting a count is a different job, and the valuation
        // report is cost data they have no reason to see.
        $this->actingAsRole('support');

        $this->getJson('/api/v1/admin/inventory')->assertOk();

        $this->postJson('/api/v1/admin/inventory/adjust', [
            'product_variation_id' => $this->variation->id,
            'quantity' => '2',
            'direction' => 'out',
            'note' => 'Damaged in the shop',
        ])->assertForbidden();

        $this->getJson('/api/v1/admin/inventory/valuation')->assertForbidden();
    }

    public function test_a_customer_account_cannot_reach_the_admin_api_at_all(): void
    {
        $this->actingAsRole('customer');

        $this->getJson('/api/v1/admin/inventory')->assertForbidden();
    }
}
