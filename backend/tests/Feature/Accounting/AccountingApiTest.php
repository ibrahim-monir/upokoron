<?php

declare(strict_types=1);

namespace Tests\Feature\Accounting;

use App\Models\Account;
use App\Models\AccountType;
use App\Models\FiscalPeriod;
use App\Models\JournalEntry;
use Database\Seeders\ChartOfAccountsSeeder;
use Database\Seeders\FiscalYearSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AccountingApiTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(ChartOfAccountsSeeder::class);
        $this->seed(FiscalYearSeeder::class);
    }

    private function accountId(string $systemKey): int
    {
        return Account::where('system_key', $systemKey)->value('id');
    }

    // ─── Chart of accounts ───────────────────────────────────────────────

    public function test_an_accountant_can_list_the_chart_of_accounts(): void
    {
        $this->actingAsRole('accountant');

        $this->getJson('/api/v1/admin/accounts')
            ->assertOk()
            ->assertJsonFragment(['code' => '1150', 'name' => 'Inventory'])
            ->assertJsonFragment(['code' => '5100', 'name' => 'Cost of Goods Sold']);
    }

    public function test_a_support_user_cannot_see_the_chart_of_accounts(): void
    {
        $this->actingAsRole('support');

        $this->getJson('/api/v1/admin/accounts')->assertForbidden();
    }

    public function test_a_system_account_can_be_renamed_but_not_retyped(): void
    {
        $this->actingAsRole('owner');

        $inventory = Account::firstWhere('system_key', 'inventory');
        $expenseType = AccountType::firstWhere('code', 'operating_expense');

        // Renaming is fine: posting rules resolve by system_key, not name.
        $this->putJson("/api/v1/admin/accounts/{$inventory->id}", [
            'code' => '1150',
            'name' => 'Stock on Hand',
            'account_type_id' => $inventory->account_type_id,
        ])->assertOk();

        $this->assertSame('Stock on Hand', $inventory->fresh()->name);

        // Retyping is not: the posting rules require an asset here.
        $this->putJson("/api/v1/admin/accounts/{$inventory->id}", [
            'code' => '1150',
            'name' => 'Stock on Hand',
            'account_type_id' => $expenseType->id,
        ])->assertStatus(409)->assertJsonPath('code', 'system_account_type_locked');
    }

    public function test_a_system_account_cannot_be_deleted(): void
    {
        $this->actingAsRole('owner');

        $this->deleteJson('/api/v1/admin/accounts/'.$this->accountId('cogs'))
            ->assertStatus(409)
            ->assertJsonPath('code', 'system_account_required');
    }

    public function test_an_account_with_ledger_history_cannot_be_deleted(): void
    {
        $this->actingAsRole('owner');

        $account = Account::create([
            'code' => '6950',
            'name' => 'Temporary Expense',
            'account_type_id' => AccountType::firstWhere('code', 'operating_expense')->id,
        ]);

        $this->postJson('/api/v1/admin/journal-entries', [
            'memo' => 'test',
            'lines' => [
                ['account_id' => $account->id, 'type' => 'debit', 'amount' => '100.00'],
                ['account_id' => $this->accountId('cash_in_hand'), 'type' => 'credit', 'amount' => '100.00'],
            ],
        ])->assertCreated();

        $this->deleteJson("/api/v1/admin/accounts/{$account->id}")
            ->assertStatus(409)
            ->assertJsonPath('code', 'account_has_history');
    }

    // ─── Manual journal entries ──────────────────────────────────────────

    public function test_an_accountant_can_post_a_manual_entry(): void
    {
        $this->actingAsRole('accountant');

        $this->postJson('/api/v1/admin/journal-entries', [
            'event' => 'rent',
            'memo' => 'August rent',
            'lines' => [
                ['account_id' => $this->accountId('rent_expense'), 'type' => 'debit', 'amount' => '15000.00'],
                ['account_id' => $this->accountId('bank_default'), 'type' => 'credit', 'amount' => '15000.00'],
            ],
        ])->assertCreated()->assertJsonPath('entry.total_debit', '15000.00');

        $this->assertSame(1, JournalEntry::count());
    }

    public function test_an_unbalanced_manual_entry_is_rejected_with_a_readable_message(): void
    {
        $this->actingAsRole('accountant');

        $this->postJson('/api/v1/admin/journal-entries', [
            'lines' => [
                ['account_id' => $this->accountId('rent_expense'), 'type' => 'debit', 'amount' => '15000.00'],
                ['account_id' => $this->accountId('bank_default'), 'type' => 'credit', 'amount' => '14000.00'],
            ],
        ])
            // 422, not 500: the accountant mistyped a figure, they did not
            // find a bug.
            ->assertStatus(422)
            ->assertJsonValidationErrors('lines');

        $this->assertSame(0, JournalEntry::count());
    }

    public function test_an_entry_cannot_be_posted_to_a_group_account(): void
    {
        $this->actingAsRole('accountant');

        $this->postJson('/api/v1/admin/journal-entries', [
            'lines' => [
                ['account_id' => Account::firstWhere('code', '1000')->id, 'type' => 'debit', 'amount' => '100.00'],
                ['account_id' => $this->accountId('cash_in_hand'), 'type' => 'credit', 'amount' => '100.00'],
            ],
        ])->assertStatus(422)->assertJsonValidationErrors('lines.0.account_id');
    }

    public function test_a_manager_cannot_post_to_the_ledger(): void
    {
        $this->actingAsRole('manager');

        $this->postJson('/api/v1/admin/journal-entries', [
            'lines' => [
                ['account_id' => $this->accountId('rent_expense'), 'type' => 'debit', 'amount' => '100.00'],
                ['account_id' => $this->accountId('cash_in_hand'), 'type' => 'credit', 'amount' => '100.00'],
            ],
        ])->assertForbidden();
    }

    public function test_an_accountant_cannot_reverse_an_entry(): void
    {
        // Posting is an accountant's job; unwinding a posted entry is the
        // owner's, because it changes an already-reported figure.
        $this->actingAsRole('owner');

        $entry = $this->postJson('/api/v1/admin/journal-entries', [
            'lines' => [
                ['account_id' => $this->accountId('rent_expense'), 'type' => 'debit', 'amount' => '100.00'],
                ['account_id' => $this->accountId('cash_in_hand'), 'type' => 'credit', 'amount' => '100.00'],
            ],
        ])->json('entry.id');

        $this->actingAsRole('accountant');

        $this->postJson("/api/v1/admin/journal-entries/{$entry}/reverse", ['reason' => 'mistake'])
            ->assertForbidden();
    }

    public function test_an_owner_can_reverse_an_entry(): void
    {
        $this->actingAsRole('owner');

        $entryId = $this->postJson('/api/v1/admin/journal-entries', [
            'lines' => [
                ['account_id' => $this->accountId('rent_expense'), 'type' => 'debit', 'amount' => '100.00'],
                ['account_id' => $this->accountId('cash_in_hand'), 'type' => 'credit', 'amount' => '100.00'],
            ],
        ])->json('entry.id');

        $this->postJson("/api/v1/admin/journal-entries/{$entryId}/reverse", ['reason' => 'Posted in error'])
            ->assertOk()
            ->assertJsonPath('entry.status', 'reversal');

        $this->assertSame('reversed', JournalEntry::find($entryId)->status->value);
    }

    // ─── Reports ─────────────────────────────────────────────────────────

    public function test_the_trial_balance_endpoint_balances(): void
    {
        $this->actingAsRole('accountant');

        $this->postJson('/api/v1/admin/journal-entries', [
            'lines' => [
                ['account_id' => $this->accountId('cash_in_hand'), 'type' => 'debit', 'amount' => '5000.00'],
                ['account_id' => $this->accountId('owner_capital'), 'type' => 'credit', 'amount' => '5000.00'],
            ],
        ])->assertCreated();

        $this->getJson('/api/v1/admin/reports/trial-balance')
            ->assertOk()
            ->assertJsonPath('balanced', true)
            ->assertJsonPath('total_debit', '5000.00')
            ->assertJsonPath('total_credit', '5000.00');
    }

    public function test_profit_and_loss_matches_the_ledger(): void
    {
        $this->actingAsRole('accountant');

        // Revenue 10,000
        $this->postJson('/api/v1/admin/journal-entries', [
            'event' => 'sale',
            'lines' => [
                ['account_id' => $this->accountId('cash_in_hand'), 'type' => 'debit', 'amount' => '10000.00'],
                ['account_id' => $this->accountId('sales_revenue'), 'type' => 'credit', 'amount' => '10000.00'],
            ],
        ])->assertCreated();

        // COGS 6,000
        $this->postJson('/api/v1/admin/journal-entries', [
            'event' => 'cogs',
            'lines' => [
                ['account_id' => $this->accountId('cogs'), 'type' => 'debit', 'amount' => '6000.00'],
                ['account_id' => $this->accountId('inventory'), 'type' => 'credit', 'amount' => '6000.00'],
            ],
        ])->assertCreated();

        // Rent 1,500
        $this->postJson('/api/v1/admin/journal-entries', [
            'event' => 'rent',
            'lines' => [
                ['account_id' => $this->accountId('rent_expense'), 'type' => 'debit', 'amount' => '1500.00'],
                ['account_id' => $this->accountId('bank_default'), 'type' => 'credit', 'amount' => '1500.00'],
            ],
        ])->assertCreated();

        $this->getJson('/api/v1/admin/reports/profit-loss')
            ->assertOk()
            ->assertJsonPath('net_sales', '10000.00')
            ->assertJsonPath('cost_of_goods_sold', '6000.00')
            ->assertJsonPath('gross_profit', '4000.00')
            ->assertJsonPath('operating_expenses', '1500.00')
            ->assertJsonPath('net_profit', '2500.00')
            ->assertJsonPath('gross_margin_percent', '40.00');
    }

    /**
     * A margin that does not divide evenly. Computing it as (profit / revenue)
     * first rounds 2000/7500 to 0.27 and reports 27.00%; the correct answer is
     * 26.67%, which needs the multiplication to happen before the division.
     */
    public function test_a_recurring_margin_is_not_lost_to_rounding(): void
    {
        $this->actingAsRole('accountant');

        $this->postJson('/api/v1/admin/journal-entries', [
            'event' => 'sale',
            'lines' => [
                ['account_id' => $this->accountId('accounts_receivable'), 'type' => 'debit', 'amount' => '7500.00'],
                ['account_id' => $this->accountId('sales_revenue'), 'type' => 'credit', 'amount' => '7500.00'],
            ],
        ])->assertCreated();

        $this->postJson('/api/v1/admin/journal-entries', [
            'event' => 'cogs',
            'lines' => [
                ['account_id' => $this->accountId('cogs'), 'type' => 'debit', 'amount' => '5500.00'],
                ['account_id' => $this->accountId('inventory'), 'type' => 'credit', 'amount' => '5500.00'],
            ],
        ])->assertCreated();

        $this->getJson('/api/v1/admin/reports/profit-loss')
            ->assertOk()
            ->assertJsonPath('gross_profit', '2000.00')
            ->assertJsonPath('gross_margin_percent', '26.67');
    }

    // ─── Period locking ──────────────────────────────────────────────────

    public function test_an_owner_can_close_a_period_and_posting_then_fails(): void
    {
        $this->actingAsRole('owner');

        $today = now(config('upokoron.display_timezone'))->toDateString();
        $current = FiscalPeriod::containing($today)->first();

        foreach (FiscalPeriod::where('end_date', '<=', $current->end_date)->orderBy('start_date')->get() as $period) {
            $this->postJson("/api/v1/admin/fiscal-periods/{$period->id}/close")->assertOk();
        }

        $this->postJson('/api/v1/admin/journal-entries', [
            'lines' => [
                ['account_id' => $this->accountId('rent_expense'), 'type' => 'debit', 'amount' => '100.00'],
                ['account_id' => $this->accountId('cash_in_hand'), 'type' => 'credit', 'amount' => '100.00'],
            ],
        ])->assertStatus(409)->assertJsonPath('code', 'period_closed');
    }

    public function test_periods_must_be_closed_in_order(): void
    {
        $this->actingAsRole('owner');

        $periods = FiscalPeriod::orderBy('start_date')->get();

        // Skipping ahead would let a later correction still land in an
        // earlier month and restate a figure already reported.
        $this->postJson("/api/v1/admin/fiscal-periods/{$periods[3]->id}/close")
            ->assertStatus(409)
            ->assertJsonPath('code', 'earlier_period_open');
    }

    public function test_an_accountant_cannot_close_a_period(): void
    {
        $this->actingAsRole('accountant');

        $period = FiscalPeriod::orderBy('start_date')->first();

        $this->postJson("/api/v1/admin/fiscal-periods/{$period->id}/close")->assertForbidden();
    }

    public function test_a_closed_period_can_be_reopened_by_the_owner(): void
    {
        $this->actingAsRole('owner');

        $period = FiscalPeriod::orderBy('start_date')->first();

        $this->postJson("/api/v1/admin/fiscal-periods/{$period->id}/close")->assertOk();
        $this->postJson("/api/v1/admin/fiscal-periods/{$period->id}/reopen")->assertOk();

        $this->assertSame('open', $period->fresh()->status->value);
    }
}
