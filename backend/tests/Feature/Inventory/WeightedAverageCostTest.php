<?php

declare(strict_types=1);

namespace Tests\Feature\Inventory;

use App\Enums\InventoryDirection;
use App\Enums\InventoryTransactionType;
use App\Exceptions\BusinessRuleException;
use App\Models\Inventory;
use App\Models\InventoryTransaction;
use App\Models\Product;
use App\Models\ProductVariation;
use App\Services\Accounting\AccountResolver;
use App\Services\Inventory\InventoryService;
use App\Support\Money;
use App\Support\Quantity;
use Database\Seeders\ChartOfAccountsSeeder;
use Database\Seeders\FiscalYearSeeder;
use Database\Seeders\UnitSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use RuntimeException;
use Tests\TestCase;

class WeightedAverageCostTest extends TestCase
{
    use RefreshDatabase;

    private InventoryService $inventory;

    private ProductVariation $variation;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(UnitSeeder::class);
        $this->seed(ChartOfAccountsSeeder::class);
        $this->seed(FiscalYearSeeder::class);

        $this->inventory = app(InventoryService::class);
        $this->variation = Product::factory()->create()->variations()->first();
    }

    private function stock(): Inventory
    {
        return Inventory::where('product_variation_id', $this->variation->id)->firstOrFail();
    }

    private function accountBalance(string $key): string
    {
        $resolver = app(AccountResolver::class);
        $resolver->flush();

        return $resolver->bySystemKey($key)->balanceAsOf()->value();
    }

    // ─── The Phase 1 worked example, through real stock ──────────────────

    /**
     * Buy 100 @ 100, then 100 @ 120. Average becomes 110. Sell 50 @ 150.
     * Gross profit must be exactly 2,000.
     */
    public function test_the_documented_worked_example(): void
    {
        $this->inventory->receive($this->variation, '100', '10000.00', counterAccount: 'accounts_payable');

        $this->assertSame('100.000', $this->stock()->quantity);
        $this->assertSame('10000.00', $this->stock()->stock_value);
        $this->assertSame('100.000000', $this->stock()->average_cost);

        $this->inventory->receive($this->variation, '100', '12000.00', counterAccount: 'accounts_payable');

        // 22,000 over 200 units.
        $this->assertSame('200.000', $this->stock()->quantity);
        $this->assertSame('22000.00', $this->stock()->stock_value);
        $this->assertSame('110.000000', $this->stock()->average_cost);

        $sale = $this->inventory->issue(
            $this->variation, '50',
            InventoryTransactionType::TransitOut,
            counterAccount: 'goods_in_transit',
        );

        // COGS for this sale, frozen on the movement.
        $this->assertSame('5500.00', $sale->total_cost);
        $this->assertSame('110.000000', $sale->unit_cost);

        $this->assertSame('150.000', $this->stock()->quantity);
        $this->assertSame('16500.00', $this->stock()->stock_value);
        $this->assertSame('110.000000', $this->stock()->average_cost);

        // Invariant I2: the stock ledger and the general ledger agree.
        $this->assertSame('16500.00', $this->accountBalance('inventory'));
        $this->assertSame('5500.00', $this->accountBalance('goods_in_transit'));

        $revenue = Money::of('7500.00');
        $grossProfit = $revenue->minus(Money::of($sale->total_cost));

        $this->assertSame('2000.00', $grossProfit->value());
    }

    /**
     * The rule that makes historical profit reproducible: a later price change
     * must not touch the cost already recorded against a past sale.
     */
    public function test_a_later_purchase_does_not_change_a_past_sales_cost(): void
    {
        $this->inventory->receive($this->variation, '100', '10000.00', counterAccount: 'accounts_payable');

        $sale = $this->inventory->issue($this->variation, '10', counterAccount: 'cogs');
        $this->assertSame('1000.00', $sale->total_cost);

        // Prices double. 90 units at 9,000 remain, plus 100 at 20,000.
        $this->inventory->receive($this->variation, '100', '20000.00', counterAccount: 'accounts_payable');

        $this->assertSame('190.000', $this->stock()->quantity);
        $this->assertSame('29000.00', $this->stock()->stock_value);
        $this->assertSame('152.631578', $this->stock()->average_cost);

        // The already-recorded sale is untouched by the price rise.
        $this->assertSame('1000.00', $sale->fresh()->total_cost);
        $this->assertSame('100.000000', $sale->fresh()->unit_cost);
    }

    // ─── Rounding: the drift that separates the two ledgers ──────────────

    /**
     * Three units bought for 10.00 cost 3.333... each. Selling them one at a
     * time must still remove exactly 10.00, or Inventory keeps a residue for
     * a product it has none of.
     */
    public function test_selling_an_indivisible_lot_one_at_a_time_leaves_nothing_behind(): void
    {
        $this->inventory->receive($this->variation, '3', '10.00', counterAccount: 'accounts_payable');

        $costs = [];

        foreach (range(1, 3) as $ignored) {
            $costs[] = $this->inventory->issue($this->variation, '1', counterAccount: 'cogs')->total_cost;
        }

        $total = array_reduce($costs, fn (Money $c, string $x) => $c->plus($x), Money::zero());

        $this->assertSame('10.00', $total->value());
        $this->assertSame('0.000', $this->stock()->quantity);
        $this->assertSame('0.00', $this->stock()->stock_value);

        // And the general ledger agrees: everything that came in has gone out.
        $this->assertSame('0.00', $this->accountBalance('inventory'));
    }

    public function test_emptying_the_stock_takes_the_whole_remaining_value(): void
    {
        $this->inventory->receive($this->variation, '7', '100.00', counterAccount: 'accounts_payable');

        $this->inventory->issue($this->variation, '3', counterAccount: 'cogs');
        $last = $this->inventory->issue($this->variation, '4', counterAccount: 'cogs');

        $this->assertSame('0.000', $this->stock()->quantity);
        $this->assertSame('0.00', $this->stock()->stock_value);
        $this->assertSame('0.000000', $this->stock()->average_cost);

        // The final movement absorbed whatever was left rather than leaving
        // a fraction of a paisa stranded.
        $this->assertSame('57.14', $last->total_cost);
    }

    // ─── Guard rails ─────────────────────────────────────────────────────

    public function test_stock_cannot_go_negative(): void
    {
        $this->inventory->receive($this->variation, '5', '500.00', counterAccount: 'accounts_payable');

        $this->expectException(BusinessRuleException::class);
        $this->expectExceptionMessageMatches('/Not enough stock/');

        $this->inventory->issue($this->variation, '6', counterAccount: 'cogs');
    }

    public function test_a_zero_quantity_movement_is_refused(): void
    {
        $this->expectException(BusinessRuleException::class);

        $this->inventory->receive($this->variation, '0', '0.00', counterAccount: 'accounts_payable');
    }

    public function test_a_non_stock_tracked_product_cannot_move_stock(): void
    {
        $service = Product::factory()->create(['is_stock_tracked' => false]);
        $variation = $service->variations()->first();

        $this->expectException(BusinessRuleException::class);
        $this->expectExceptionMessageMatches('/not stock tracked/');

        $this->inventory->receive($variation, '1', '10.00', counterAccount: 'accounts_payable');
    }

    /**
     * The stock ledger is append-only, exactly like the journal.
     */
    public function test_a_stock_movement_cannot_be_edited_or_deleted(): void
    {
        $movement = $this->inventory->receive($this->variation, '5', '500.00', counterAccount: 'accounts_payable');

        try {
            $movement->forceFill(['quantity' => '999'])->save();
            $this->fail('A stock movement was edited.');
        } catch (RuntimeException $e) {
            $this->assertStringContainsString('immutable', $e->getMessage());
        }

        $this->expectException(RuntimeException::class);
        $movement->delete();
    }

    /**
     * The unique index on (reference, variation, type) is the last defence
     * against a retried receipt moving the same stock twice.
     */
    public function test_the_same_document_cannot_move_the_same_stock_twice(): void
    {
        $document = Product::factory()->create();

        $this->inventory->receive(
            $this->variation, '10', '1000.00',
            InventoryTransactionType::Purchase,
            reference: $document,
            counterAccount: 'accounts_payable',
        );

        $this->expectException(BusinessRuleException::class);
        $this->expectExceptionMessageMatches('/already been moved/');

        $this->inventory->receive(
            $this->variation, '10', '1000.00',
            InventoryTransactionType::Purchase,
            reference: $document,
            counterAccount: 'accounts_payable',
        );
    }

    // ─── Invariants ──────────────────────────────────────────────────────

    /** I3: quantity equals the signed sum of its own movements. */
    public function test_quantity_equals_the_sum_of_its_movements(): void
    {
        $this->inventory->receive($this->variation, '100', '10000.00', counterAccount: 'accounts_payable');
        $this->inventory->issue($this->variation, '30', counterAccount: 'cogs');
        $this->inventory->receive($this->variation, '20', '2400.00', counterAccount: 'accounts_payable');
        $this->inventory->issue($this->variation, '15', counterAccount: 'cogs');

        $ledgerQty = InventoryTransaction::where('product_variation_id', $this->variation->id)
            ->get()
            ->reduce(fn ($carry, $t) => $carry->plus($t->signedQuantity()), Quantity::zero());

        $this->assertSame($this->stock()->quantity, $ledgerQty->value());
        $this->assertSame('75.000', $ledgerQty->value());
    }

    /** I2: the stock subledger equals the Inventory control account. */
    public function test_stock_value_equals_the_inventory_account(): void
    {
        $second = Product::factory()->create()->variations()->first();

        $this->inventory->receive($this->variation, '10', '1234.56', counterAccount: 'accounts_payable');
        $this->inventory->receive($second, '7', '999.99', counterAccount: 'accounts_payable');
        $this->inventory->issue($this->variation, '3', counterAccount: 'cogs');

        $subledger = Inventory::sum('stock_value');

        $this->assertSame(
            $this->accountBalance('inventory'),
            Money::of((string) $subledger)->value(),
        );
    }

    // ─── Adjustments ─────────────────────────────────────────────────────

    public function test_damage_writes_the_value_off_to_shrinkage(): void
    {
        $this->inventory->receive($this->variation, '10', '1000.00', counterAccount: 'accounts_payable');

        $this->inventory->adjust(
            $this->variation, '2', InventoryDirection::Out,
            InventoryTransactionType::Damage,
            note: 'Water damage',
        );

        $this->assertSame('8.000', $this->stock()->quantity);
        $this->assertSame('800.00', $this->stock()->stock_value);

        // The value did not vanish -- it landed in the P&L.
        $this->assertSame('200.00', $this->accountBalance('inventory_shrinkage'));
        $this->assertSame('800.00', $this->accountBalance('inventory'));
    }

    public function test_found_stock_comes_in_at_the_current_average(): void
    {
        $this->inventory->receive($this->variation, '10', '1000.00', counterAccount: 'accounts_payable');

        $this->inventory->adjust(
            $this->variation, '3', InventoryDirection::In,
            InventoryTransactionType::Found,
            note: 'Recount',
        );

        $this->assertSame('13.000', $this->stock()->quantity);
        // A recount must not move the average.
        $this->assertSame('100.000000', $this->stock()->average_cost);
        $this->assertSame('1300.00', $this->stock()->stock_value);
    }

    public function test_opening_stock_posts_against_opening_balance_equity(): void
    {
        $this->inventory->openingStock($this->variation, '50', '5000.00');

        $this->assertSame('50.000', $this->stock()->quantity);
        $this->assertSame('5000.00', $this->accountBalance('inventory'));
        $this->assertSame('5000.00', $this->accountBalance('opening_balance_equity'));
    }

    // ─── Returns use the frozen cost, not today's average ────────────────

    /**
     * Returning goods to a supplier at the current average instead of what
     * they were received for leaks value into or out of Inventory.
     */
    public function test_a_purchase_return_goes_back_at_its_received_cost(): void
    {
        $this->inventory->receive($this->variation, '10', '1000.00', counterAccount: 'accounts_payable');
        // Average rises to 150.
        $this->inventory->receive($this->variation, '10', '2000.00', counterAccount: 'accounts_payable');

        $this->assertSame('150.000000', $this->stock()->average_cost);

        $return = $this->inventory->issueAtCost(
            $this->variation, '5', '100.00',
            InventoryTransactionType::PurchaseReturn,
            counterAccount: 'accounts_payable',
        );

        // Returned at 100 each, not at the 150 average.
        $this->assertSame('500.00', $return->total_cost);
        $this->assertSame('2500.00', $this->stock()->stock_value);
    }

    public function test_every_movement_records_the_average_that_resulted(): void
    {
        $this->inventory->receive($this->variation, '100', '10000.00', counterAccount: 'accounts_payable');
        $this->inventory->receive($this->variation, '100', '12000.00', counterAccount: 'accounts_payable');

        $movements = InventoryTransaction::where('product_variation_id', $this->variation->id)
            ->orderBy('id')->get();

        $this->assertSame('100.000000', $movements[0]->average_cost_after);
        $this->assertSame('110.000000', $movements[1]->average_cost_after);
        $this->assertSame('10000.00', $movements[1]->value_before);
        $this->assertSame('22000.00', $movements[1]->value_after);
    }
}
