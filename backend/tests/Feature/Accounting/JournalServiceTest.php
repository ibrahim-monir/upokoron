<?php

declare(strict_types=1);

namespace Tests\Feature\Accounting;

use App\Enums\JournalEntryStatus;
use App\Exceptions\BusinessRuleException;
use App\Exceptions\ClosedPeriodException;
use App\Exceptions\DuplicateJournalEntryException;
use App\Exceptions\UnbalancedEntryException;
use App\Models\Account;
use App\Models\Customer;
use App\Models\FiscalPeriod;
use App\Models\JournalEntry;
use App\Services\Accounting\AccountResolver;
use App\Services\Accounting\JournalLine;
use App\Services\Accounting\JournalService;
use App\Services\Accounting\PeriodService;
use App\Services\Support\DocumentNumberService;
use App\Support\Money;
use Database\Seeders\ChartOfAccountsSeeder;
use Database\Seeders\FiscalYearSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use RuntimeException;
use Tests\TestCase;

class JournalServiceTest extends TestCase
{
    use RefreshDatabase;

    private JournalService $journal;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(ChartOfAccountsSeeder::class);
        $this->seed(FiscalYearSeeder::class);

        $this->journal = app(JournalService::class);
    }

    /** A stand-in source document, so entries have something to reference. */
    private function document(): Customer
    {
        return Customer::create(['code' => 'CUS-TEST-'.uniqid(), 'name' => 'Test Party']);
    }

    // ─── Invariant I1: every entry balances ──────────────────────────────

    public function test_it_posts_a_balanced_entry(): void
    {
        $entry = $this->journal->post('test.sale', [
            JournalLine::debit('cash_in_hand', '10000.00'),
            JournalLine::credit('sales_revenue', '10000.00'),
        ], reference: $this->document());

        $this->assertSame('10000.00', $entry->total_debit);
        $this->assertSame('10000.00', $entry->total_credit);
        $this->assertCount(2, $entry->lines);
        $this->assertSame(JournalEntryStatus::Posted, $entry->status);
    }

    public function test_an_unbalanced_entry_is_refused(): void
    {
        $this->expectException(UnbalancedEntryException::class);

        $this->journal->post('test.bad', [
            JournalLine::debit('cash_in_hand', '10000.00'),
            JournalLine::credit('sales_revenue', '9000.00'),
        ], reference: $this->document());
    }

    public function test_nothing_is_written_when_an_entry_is_refused(): void
    {
        try {
            $this->journal->post('test.bad', [
                JournalLine::debit('cash_in_hand', '10000.00'),
                JournalLine::credit('sales_revenue', '9000.00'),
            ], reference: $this->document());
        } catch (UnbalancedEntryException) {
            // expected
        }

        // A rejected entry leaves no partial rows and burns no document number.
        $this->assertSame(0, JournalEntry::count());
        $this->assertSame(0, DB::table('journal_entry_lines')->count());
        $this->assertSame('JV-2026-000001', app(DocumentNumberService::class)->peek('journal_entry'));
    }

    public function test_a_single_sided_entry_is_refused(): void
    {
        $this->expectException(BusinessRuleException::class);

        $this->journal->post('test.single', [
            JournalLine::debit('cash_in_hand', '100.00'),
        ], reference: $this->document());
    }

    public function test_a_line_cannot_carry_both_a_debit_and_a_credit(): void
    {
        $this->expectException(\InvalidArgumentException::class);

        // Constructed through the factory methods, this is unrepresentable --
        // which is the point of using a typed line instead of an array.
        (function () {
            $r = new \ReflectionClass(JournalLine::class);
            $c = $r->getConstructor();
            $c->setAccessible(true);
            $line = $r->newInstanceWithoutConstructor();
            $c->invoke($line, 'cash_in_hand', Money::of('10'), Money::of('10'));
        })();
    }

    public function test_a_negative_amount_is_refused(): void
    {
        $this->expectException(\InvalidArgumentException::class);

        JournalLine::debit('cash_in_hand', '-100.00');
    }

    // ─── Idempotency ─────────────────────────────────────────────────────

    public function test_the_same_event_cannot_be_posted_twice_for_one_document(): void
    {
        $doc = $this->document();

        $this->journal->post('order.revenue', [
            JournalLine::debit('accounts_receivable', '500.00'),
            JournalLine::credit('sales_revenue', '500.00'),
        ], reference: $doc);

        $this->expectException(DuplicateJournalEntryException::class);

        $this->journal->post('order.revenue', [
            JournalLine::debit('accounts_receivable', '500.00'),
            JournalLine::credit('sales_revenue', '500.00'),
        ], reference: $doc);
    }

    public function test_the_same_event_may_be_posted_for_different_documents(): void
    {
        foreach ([$this->document(), $this->document()] as $doc) {
            $this->journal->post('order.revenue', [
                JournalLine::debit('accounts_receivable', '500.00'),
                JournalLine::credit('sales_revenue', '500.00'),
            ], reference: $doc);
        }

        $this->assertSame(2, JournalEntry::where('event', 'order.revenue')->count());
    }

    public function test_post_once_returns_the_existing_entry_instead_of_duplicating(): void
    {
        $doc = $this->document();

        $lines = fn () => [
            JournalLine::debit('gateway_clearing', '500.00'),
            JournalLine::credit('customer_advance', '500.00'),
        ];

        $first = $this->journal->postOnce($doc, 'payment.received', $lines());
        $second = $this->journal->postOnce($doc, 'payment.received', $lines());

        $this->assertSame($first->id, $second->id);
        $this->assertSame(1, JournalEntry::where('event', 'payment.received')->count());
    }

    /**
     * The hole found during Phase 3 smoke testing: MySQL unique indexes do
     * not constrain NULLs, so a document event posted without a reference
     * could be duplicated freely and nothing would show it.
     */
    public function test_a_document_event_without_a_reference_is_refused(): void
    {
        $this->expectException(BusinessRuleException::class);
        $this->expectExceptionMessageMatches('/must name the document it came from/');

        $this->journal->post('order.revenue', [
            JournalLine::debit('accounts_receivable', '500.00'),
            JournalLine::credit('sales_revenue', '500.00'),
        ]);
    }

    public function test_a_manual_entry_may_be_posted_without_a_reference(): void
    {
        $entry = $this->journal->post('manual.adjustment', [
            JournalLine::debit('office_expense', '250.00'),
            JournalLine::credit('cash_in_hand', '250.00'),
        ]);

        $this->assertNull($entry->reference_type);
    }

    public function test_manual_entries_may_legitimately_repeat(): void
    {
        foreach ([1, 2] as $ignored) {
            $this->journal->post('manual.adjustment', [
                JournalLine::debit('office_expense', '250.00'),
                JournalLine::credit('cash_in_hand', '250.00'),
            ]);
        }

        $this->assertSame(2, JournalEntry::where('event', 'manual.adjustment')->count());
    }

    // ─── Immutability ────────────────────────────────────────────────────

    public function test_a_posted_entry_cannot_be_edited(): void
    {
        $entry = $this->journal->post('test.sale', [
            JournalLine::debit('cash_in_hand', '100.00'),
            JournalLine::credit('sales_revenue', '100.00'),
        ], reference: $this->document());

        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessageMatches('/immutable/');

        // forceFill bypasses the empty $fillable, so this is the path that
        // actually reaches the model's updating guard.
        $entry->forceFill(['memo' => 'tampered'])->save();
    }

    public function test_a_posted_entry_cannot_be_deleted(): void
    {
        $entry = $this->journal->post('test.sale', [
            JournalLine::debit('cash_in_hand', '100.00'),
            JournalLine::credit('sales_revenue', '100.00'),
        ], reference: $this->document());

        $this->expectException(RuntimeException::class);

        $entry->delete();
    }

    public function test_a_line_cannot_be_edited(): void
    {
        $entry = $this->journal->post('test.sale', [
            JournalLine::debit('cash_in_hand', '100.00'),
            JournalLine::credit('sales_revenue', '100.00'),
        ], reference: $this->document());

        $this->expectException(RuntimeException::class);

        $entry->lines->first()->forceFill(['debit' => '999.00'])->save();
    }

    // ─── Reversal ────────────────────────────────────────────────────────

    public function test_reversing_an_entry_mirrors_it_and_nets_to_zero(): void
    {
        $doc = $this->document();
        $resolver = app(AccountResolver::class);

        $entry = $this->journal->post('order.revenue', [
            JournalLine::debit('accounts_receivable', '7500.00'),
            JournalLine::credit('sales_revenue', '7500.00'),
        ], reference: $doc);

        $this->assertSame('7500.00', $resolver->bySystemKey('sales_revenue')->balanceAsOf()->value());

        $reversal = $this->journal->reverse($entry, 'Customer refused delivery');

        $this->assertSame(JournalEntryStatus::Reversal, $reversal->status);
        $this->assertSame(JournalEntryStatus::Reversed, $entry->fresh()->status);
        $this->assertSame($reversal->id, $entry->fresh()->reversed_by_entry_id);

        // Both entries stay in the ledger and cancel out. The original is
        // never removed, so the audit trail survives the correction.
        $resolver->flush();
        $this->assertSame('0.00', $resolver->bySystemKey('sales_revenue')->balanceAsOf()->value());
        $this->assertSame(2, JournalEntry::count());
    }

    public function test_an_entry_cannot_be_reversed_twice(): void
    {
        $entry = $this->journal->post('order.revenue', [
            JournalLine::debit('accounts_receivable', '100.00'),
            JournalLine::credit('sales_revenue', '100.00'),
        ], reference: $this->document());

        $this->journal->reverse($entry, 'first');

        $this->expectException(BusinessRuleException::class);
        $this->expectExceptionMessageMatches('/already been reversed/');

        $this->journal->reverse($entry->fresh(), 'second');
    }

    public function test_a_reversal_cannot_itself_be_reversed(): void
    {
        $entry = $this->journal->post('order.revenue', [
            JournalLine::debit('accounts_receivable', '100.00'),
            JournalLine::credit('sales_revenue', '100.00'),
        ], reference: $this->document());

        $reversal = $this->journal->reverse($entry, 'mistake');

        $this->expectException(BusinessRuleException::class);

        $this->journal->reverse($reversal, 'again');
    }

    public function test_reverse_for_returns_null_when_nothing_was_posted(): void
    {
        $result = $this->journal->reverseFor($this->document(), 'order.revenue', 'cancelled');

        $this->assertNull($result);
    }

    // ─── Invariant I2: closed periods ────────────────────────────────────

    public function test_posting_into_a_closed_period_is_refused(): void
    {
        $periods = app(PeriodService::class);

        $period = $periods->periodFor(now(config('upokoron.display_timezone'))->toDateString());

        // Close everything up to and including the current period.
        foreach (FiscalPeriod::where('end_date', '<=', $period->end_date)->orderBy('start_date')->get() as $p) {
            $periods->closePeriod($p);
        }

        $this->expectException(ClosedPeriodException::class);

        $this->journal->post('order.revenue', [
            JournalLine::debit('accounts_receivable', '100.00'),
            JournalLine::credit('sales_revenue', '100.00'),
        ], reference: $this->document());
    }

    public function test_posting_to_a_date_with_no_fiscal_period_is_refused(): void
    {
        $this->expectException(ClosedPeriodException::class);
        $this->expectExceptionMessageMatches('/No accounting period covers/');

        $this->journal->post('order.revenue', [
            JournalLine::debit('accounts_receivable', '100.00'),
            JournalLine::credit('sales_revenue', '100.00'),
        ], date: '2001-01-15', reference: $this->document());
    }

    // ─── Party subledger ─────────────────────────────────────────────────

    public function test_lines_can_be_tagged_to_a_party_for_the_subledger(): void
    {
        $customer = $this->document();

        $entry = $this->journal->post('order.revenue', [
            JournalLine::debit('accounts_receivable', '500.00', party: $customer),
            JournalLine::credit('sales_revenue', '500.00'),
        ], reference: $customer);

        $line = $entry->lines->firstWhere('party_id', $customer->id);

        $this->assertNotNull($line);
        $this->assertSame($customer->getMorphClass(), $line->party_type);
    }

    // ─── Accounts ────────────────────────────────────────────────────────

    public function test_posting_to_a_group_account_is_refused(): void
    {
        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessageMatches('/group header/');

        $this->journal->post('manual.adjustment', [
            // 1000 "Assets" is a report header, not a postable account.
            JournalLine::debit(Account::firstWhere('code', '1000')->id, '100.00'),
            JournalLine::credit('cash_in_hand', '100.00'),
        ]);
    }

    public function test_an_unmapped_system_key_fails_with_a_useful_message(): void
    {
        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessageMatches('/No account is mapped to system key \[not_a_key\]/');

        $this->journal->post('manual.adjustment', [
            JournalLine::debit('not_a_key', '100.00'),
            JournalLine::credit('cash_in_hand', '100.00'),
        ]);
    }
}
