<?php

declare(strict_types=1);

namespace Tests\Feature\Accounting;

use App\Models\Customer;
use App\Services\Accounting\AccountResolver;
use App\Services\Accounting\JournalLine;
use App\Services\Accounting\JournalService;
use App\Services\Accounting\LedgerService;
use App\Services\Accounting\TrialBalanceService;
use App\Support\Money;
use Database\Seeders\ChartOfAccountsSeeder;
use Database\Seeders\FiscalYearSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class TrialBalanceTest extends TestCase
{
    use RefreshDatabase;

    private JournalService $journal;

    private TrialBalanceService $trial;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(ChartOfAccountsSeeder::class);
        $this->seed(FiscalYearSeeder::class);

        $this->journal = app(JournalService::class);
        $this->trial = app(TrialBalanceService::class);
    }

    private function document(): Customer
    {
        return Customer::create(['code' => 'CUS-'.uniqid(), 'name' => 'Test Party']);
    }

    /**
     * The Phase 1 worked example, end to end.
     *
     * Buy 100 @ 100 then 100 @ 120 (average 110), sell 50 @ 150.
     * Gross profit must be exactly 2,000 and must be provable from the ledger.
     */
    public function test_the_worked_example_produces_the_documented_gross_profit(): void
    {
        $doc = $this->document();

        $this->journal->post('purchase.receipt', [
            JournalLine::debit('inventory', '10000.00'),
            JournalLine::credit('accounts_payable', '10000.00'),
        ], reference: $doc);

        $this->journal->post('purchase.receipt2', [
            JournalLine::debit('inventory', '12000.00'),
            JournalLine::credit('accounts_payable', '12000.00'),
        ], reference: $doc);

        // Shipped: stock leaves, but no revenue and no COGS yet.
        $this->journal->post('order.shipped', [
            JournalLine::debit('goods_in_transit', '5500.00'),
            JournalLine::credit('inventory', '5500.00'),
        ], reference: $doc);

        // Delivered: revenue and COGS recognised together.
        $this->journal->post('order.revenue', [
            JournalLine::debit('accounts_receivable', '7500.00'),
            JournalLine::credit('sales_revenue', '7500.00'),
        ], reference: $doc);

        $this->journal->post('order.cogs', [
            JournalLine::debit('cogs', '5500.00'),
            JournalLine::credit('goods_in_transit', '5500.00'),
        ], reference: $doc);

        $totals = $this->trial->categoryTotals();

        $grossProfit = Money::of($totals['revenue'])->minus(Money::of($totals['cogs']));

        $this->assertSame('7500.00', $totals['revenue']);
        $this->assertSame('5500.00', $totals['cogs']);
        $this->assertSame('2000.00', $grossProfit->value());
    }

    public function test_inventory_and_goods_in_transit_land_where_expected(): void
    {
        $doc = $this->document();

        $this->journal->post('purchase.receipt', [
            JournalLine::debit('inventory', '22000.00'),
            JournalLine::credit('accounts_payable', '22000.00'),
        ], reference: $doc);

        $this->journal->post('order.shipped', [
            JournalLine::debit('goods_in_transit', '5500.00'),
            JournalLine::credit('inventory', '5500.00'),
        ], reference: $doc);

        $ledger = app(LedgerService::class);
        $accounts = app(AccountResolver::class);

        $this->assertSame('16500.00', $accounts->bySystemKey('inventory')->balanceAsOf()->value());
        $this->assertSame('5500.00', $accounts->bySystemKey('goods_in_transit')->balanceAsOf()->value());

        // Delivery clears goods in transit into COGS.
        $this->journal->post('order.cogs', [
            JournalLine::debit('cogs', '5500.00'),
            JournalLine::credit('goods_in_transit', '5500.00'),
        ], reference: $doc);

        $accounts->flush();
        $this->assertSame('0.00', $accounts->bySystemKey('goods_in_transit')->balanceAsOf()->value());
    }

    public function test_the_trial_balance_always_balances(): void
    {
        $doc = $this->document();

        $this->journal->post('order.revenue', [
            JournalLine::debit('accounts_receivable', '1234.56'),
            JournalLine::credit('sales_revenue', '1100.00'),
            JournalLine::credit('shipping_income', '134.56'),
        ], reference: $doc);

        $this->journal->post('expense.rent', [
            JournalLine::debit('rent_expense', '15000.00'),
            JournalLine::credit('bank_default', '15000.00'),
        ], reference: $doc);

        $result = $this->trial->build();

        $this->assertTrue($result['balanced']);
        $this->assertSame($result['total_debit'], $result['total_credit']);
    }

    public function test_a_reversal_leaves_the_trial_balance_balanced(): void
    {
        $doc = $this->document();

        $entry = $this->journal->post('order.revenue', [
            JournalLine::debit('accounts_receivable', '999.99'),
            JournalLine::credit('sales_revenue', '999.99'),
        ], reference: $doc);

        $this->journal->reverse($entry, 'returned');

        $result = $this->trial->build();

        $this->assertTrue($result['balanced']);

        // Revenue is fully undone but both entries remain visible.
        $revenueRow = collect($result['rows'])->firstWhere('code', '4100');
        $this->assertSame('0.00', $revenueRow['debit']);
        $this->assertSame('0.00', $revenueRow['credit']);
    }

    public function test_contra_revenue_reduces_revenue_rather_than_adding_to_it(): void
    {
        $doc = $this->document();

        $this->journal->post('order.revenue', [
            JournalLine::debit('accounts_receivable', '1000.00'),
            JournalLine::credit('sales_revenue', '1000.00'),
        ], reference: $doc);

        // A sales return: debit-normal, but still a revenue-category account.
        $this->journal->post('return.refund', [
            JournalLine::debit('sales_returns', '250.00'),
            JournalLine::credit('accounts_receivable', '250.00'),
        ], reference: $doc);

        $totals = $this->trial->categoryTotals();

        // 1000 revenue less a 250 return = 750 net.
        $this->assertSame('750.00', $totals['revenue']);
    }

    public function test_the_trial_balance_respects_an_as_of_date(): void
    {
        $doc = $this->document();

        $this->journal->post('order.revenue', [
            JournalLine::debit('accounts_receivable', '500.00'),
            JournalLine::credit('sales_revenue', '500.00'),
        ], date: now(config('upokoron.display_timezone'))->subDays(5), reference: $doc);

        $this->journal->post('order.revenue2', [
            JournalLine::debit('accounts_receivable', '700.00'),
            JournalLine::credit('sales_revenue', '700.00'),
        ], reference: $doc);

        $asOf = now(config('upokoron.display_timezone'))->subDays(2)->toDateString();

        $totals = $this->trial->categoryTotals($asOf);

        $this->assertSame('500.00', $totals['revenue']);
    }

    public function test_a_party_ledger_matches_the_control_account(): void
    {
        $customerA = $this->document();
        $customerB = $this->document();

        $this->journal->post('order.revenue', [
            JournalLine::debit('accounts_receivable', '400.00', party: $customerA),
            JournalLine::credit('sales_revenue', '400.00'),
        ], reference: $customerA);

        $this->journal->post('order.revenue', [
            JournalLine::debit('accounts_receivable', '600.00', party: $customerB),
            JournalLine::credit('sales_revenue', '600.00'),
        ], reference: $customerB);

        $ledger = app(LedgerService::class);
        $accounts = app(AccountResolver::class);

        $balanceA = $ledger->partyBalance($customerA);
        $balanceB = $ledger->partyBalance($customerB);
        $control = $accounts->bySystemKey('accounts_receivable')->balanceAsOf();

        // Invariant I6: the sum of the subledger equals the control account.
        // It holds by construction here, because both are the same rows read
        // two different ways rather than two tables kept in step by hand.
        $this->assertSame('400.00', $balanceA->value());
        $this->assertSame('600.00', $balanceB->value());
        $this->assertSame($control->value(), $balanceA->plus($balanceB)->value());
    }

    public function test_an_account_ledger_shows_a_running_balance(): void
    {
        $doc = $this->document();

        foreach (['100.00', '250.00', '75.50'] as $amount) {
            $this->journal->post('expense.'.$amount, [
                JournalLine::debit('office_expense', $amount),
                JournalLine::credit('cash_in_hand', $amount),
            ], reference: $doc);
        }

        $account = app(AccountResolver::class)->bySystemKey('office_expense');

        $ledger = app(LedgerService::class)->accountLedger($account);

        $this->assertCount(3, $ledger['rows']);
        $this->assertSame('100.00', $ledger['rows'][0]['balance']);
        $this->assertSame('350.00', $ledger['rows'][1]['balance']);
        $this->assertSame('425.50', $ledger['rows'][2]['balance']);
        $this->assertSame('425.50', $ledger['closing_balance']);
    }
}
