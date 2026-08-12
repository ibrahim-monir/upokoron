<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Models\Account;
use App\Services\Accounting\TrialBalanceService;
use App\Support\Money;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * Verifies the ledger invariants from the Phase 1 architecture.
 *
 * Runs nightly from the scheduler. These are the failures no report would
 * otherwise reveal: a trial balance that no longer balances, or an entry
 * whose header disagrees with its own lines, means something wrote to the
 * ledger without going through JournalService.
 *
 * Later phases extend this with the inventory invariants (I2, I3, I4).
 */
class CheckAccountingIntegrity extends Command
{
    protected $signature = 'accounting:check {--as-of= : Check the ledger as of this date}';

    protected $description = 'Verify the general ledger invariants';

    private int $failures = 0;

    public function handle(TrialBalanceService $trial): int
    {
        $asOf = $this->option('as-of');

        $this->info('Checking ledger integrity'.($asOf ? " as of {$asOf}" : '').'...');
        $this->newLine();

        $this->checkEveryEntryBalances();
        $this->checkHeadersMatchLines();
        $this->checkNoOrphanLines();
        $this->checkLinesAreSingleSided();
        $this->checkEntryDatesMatchLines();
        $this->checkTrialBalance($trial, $asOf);
        $this->checkReversalLinkage();

        $this->newLine();
        $this->line('  <fg=gray>inventory</>');

        $this->checkStockValueMatchesInventoryAccount();
        $this->checkQuantityMatchesMovements();
        $this->checkReservedMatchesReservations();
        $this->checkNoNegativeStock();
        $this->checkNoValueWithoutStock();

        $this->newLine();

        if ($this->failures > 0) {
            $this->error("{$this->failures} integrity check(s) FAILED.");

            return self::FAILURE;
        }

        $this->info('All ledger integrity checks passed.');

        return self::SUCCESS;
    }

    /** I1: every entry's debits equal its credits. */
    private function checkEveryEntryBalances(): void
    {
        $broken = DB::table('journal_entry_lines')
            ->select('journal_entry_id')
            ->selectRaw('SUM(debit) as d, SUM(credit) as c')
            ->groupBy('journal_entry_id')
            ->havingRaw('SUM(debit) <> SUM(credit)')
            ->get();

        $this->report(
            'I1  every entry balances',
            $broken->isEmpty(),
            fn () => $broken->map(fn ($r) => "entry #{$r->journal_entry_id}: debit {$r->d} vs credit {$r->c}")->all(),
        );
    }

    /** The stored totals must agree with the lines they summarise. */
    private function checkHeadersMatchLines(): void
    {
        $broken = DB::table('journal_entries as e')
            ->leftJoin('journal_entry_lines as l', 'l.journal_entry_id', '=', 'e.id')
            ->select('e.id', 'e.number', 'e.total_debit', 'e.total_credit')
            ->selectRaw('COALESCE(SUM(l.debit), 0) as line_debit')
            ->groupBy('e.id', 'e.number', 'e.total_debit', 'e.total_credit')
            ->havingRaw('e.total_debit <> COALESCE(SUM(l.debit), 0)')
            ->get();

        $this->report(
            'I1  headers match their lines',
            $broken->isEmpty(),
            fn () => $broken->map(fn ($r) => "{$r->number}: header {$r->total_debit} vs lines {$r->line_debit}")->all(),
        );
    }

    private function checkNoOrphanLines(): void
    {
        $orphans = DB::table('journal_entry_lines as l')
            ->leftJoin('journal_entries as e', 'e.id', '=', 'l.journal_entry_id')
            ->whereNull('e.id')
            ->count();

        $this->report('    no orphaned lines', $orphans === 0, fn () => ["{$orphans} lines with no entry"]);
    }

    private function checkLinesAreSingleSided(): void
    {
        $broken = DB::table('journal_entry_lines')
            ->where(fn ($q) => $q->where('debit', '<', 0)->orWhere('credit', '<', 0))
            ->orWhere(fn ($q) => $q->where('debit', '>', 0)->where('credit', '>', 0))
            ->count();

        $this->report('    lines are one-sided and non-negative', $broken === 0, fn () => ["{$broken} bad lines"]);
    }

    /** A line dated differently from its entry would land in the wrong period. */
    private function checkEntryDatesMatchLines(): void
    {
        $broken = DB::table('journal_entry_lines as l')
            ->join('journal_entries as e', 'e.id', '=', 'l.journal_entry_id')
            ->whereColumn('l.entry_date', '<>', 'e.entry_date')
            ->count();

        $this->report('    line dates match their entry', $broken === 0, fn () => ["{$broken} mismatched lines"]);
    }

    private function checkTrialBalance(TrialBalanceService $trial, ?string $asOf): void
    {
        $result = $trial->build($asOf);

        $this->report(
            'I1  trial balance balances',
            $result['balanced'],
            fn () => [
                'debits  '.Money::of($result['total_debit'])->format(),
                'credits '.Money::of($result['total_credit'])->format(),
                'diff    '.Money::of($result['total_debit'])->minus($result['total_credit'])->format(),
            ],
        );
    }

    private function checkReversalLinkage(): void
    {
        // A reversal must point at an original, and that original must point
        // back. A one-way link means a correction half-applied.
        $broken = DB::table('journal_entries as r')
            ->join('journal_entries as o', 'o.id', '=', 'r.reversal_of_entry_id')
            ->whereNotNull('r.reversal_of_entry_id')
            ->where(fn ($q) => $q->whereColumn('o.reversed_by_entry_id', '<>', 'r.id')
                ->orWhereNull('o.reversed_by_entry_id'))
            ->count();

        $this->report('    reversal links are two-way', $broken === 0, fn () => ["{$broken} one-way links"]);
    }

    /**
     * I2: the stock subledger equals the Inventory control account.
     *
     * The single most important inventory check. If these disagree, either a
     * stock movement skipped the ledger or a journal entry touched Inventory
     * without moving stock -- and the balance sheet is wrong either way.
     */
    private function checkStockValueMatchesInventoryAccount(): void
    {
        $subledger = Money::of((string) (DB::table('inventories')->sum('stock_value') ?: 0));

        $account = Account::firstWhere('system_key', 'inventory');

        if ($account === null) {
            $this->report('I2  stock value matches Inventory account', false, fn () => ['no account mapped to system key [inventory]']);

            return;
        }

        $control = $account->balanceAsOf();

        $this->report(
            'I2  stock value matches Inventory account',
            $subledger->equals($control),
            fn () => [
                'stock subledger '.$subledger->format(),
                'Inventory 1150  '.$control->format(),
                'difference      '.$subledger->minus($control)->format(),
            ],
        );
    }

    /** I3: on-hand quantity equals the signed sum of its own movements. */
    private function checkQuantityMatchesMovements(): void
    {
        $broken = DB::table('inventories as i')
            ->leftJoin('inventory_transactions as t', 't.product_variation_id', '=', 'i.product_variation_id')
            ->select('i.product_variation_id', 'i.quantity')
            ->selectRaw("COALESCE(SUM(CASE WHEN t.direction = 'in' THEN t.quantity ELSE -t.quantity END), 0) as ledger_qty")
            ->groupBy('i.product_variation_id', 'i.quantity')
            ->havingRaw("i.quantity <> COALESCE(SUM(CASE WHEN t.direction = 'in' THEN t.quantity ELSE -t.quantity END), 0)")
            ->get();

        $this->report(
            'I3  quantity matches the stock ledger',
            $broken->isEmpty(),
            fn () => $broken->map(fn ($r) => "variation #{$r->product_variation_id}: on hand {$r->quantity} vs ledger {$r->ledger_qty}")->all(),
        );
    }

    /** I4: the reserved counter equals the active reservation rows. */
    private function checkReservedMatchesReservations(): void
    {
        $broken = DB::table('inventories as i')
            ->leftJoin('stock_reservations as r', function ($join): void {
                $join->on('r.product_variation_id', '=', 'i.product_variation_id')
                    ->where('r.status', '=', 'active');
            })
            ->select('i.product_variation_id', 'i.reserved_quantity')
            ->selectRaw('COALESCE(SUM(r.quantity), 0) as held')
            ->groupBy('i.product_variation_id', 'i.reserved_quantity')
            ->havingRaw('i.reserved_quantity <> COALESCE(SUM(r.quantity), 0)')
            ->get();

        $this->report(
            'I4  reserved matches active reservations',
            $broken->isEmpty(),
            fn () => $broken->map(fn ($r) => "variation #{$r->product_variation_id}: counter {$r->reserved_quantity} vs rows {$r->held}")->all(),
        );
    }

    private function checkNoNegativeStock(): void
    {
        $broken = DB::table('inventories')
            ->where('quantity', '<', 0)
            ->orWhere('reserved_quantity', '<', 0)
            ->orWhere('stock_value', '<', 0)
            ->count();

        $this->report('    no negative stock or value', $broken === 0, fn () => ["{$broken} row(s)"]);
    }

    /**
     * Value stranded on an item with no units left.
     *
     * This is the drift the full-depletion rule in CostingService exists to
     * prevent: if it ever appears, Inventory is carrying money for stock that
     * does not exist.
     */
    private function checkNoValueWithoutStock(): void
    {
        $broken = DB::table('inventories')
            ->where('quantity', '=', 0)
            ->where('stock_value', '<>', 0)
            ->get(['product_variation_id', 'stock_value']);

        $this->report(
            '    no value left on zero stock',
            $broken->isEmpty(),
            fn () => $broken->map(fn ($r) => "variation #{$r->product_variation_id}: {$r->stock_value} with no units")->all(),
        );
    }

    /**
     * @param  callable(): array<int, string>  $details
     */
    private function report(string $label, bool $passed, callable $details): void
    {
        if ($passed) {
            $this->line("  <fg=green>PASS</> {$label}");

            return;
        }

        $this->failures++;
        $this->line("  <fg=red>FAIL</> {$label}");

        foreach (array_slice($details(), 0, 10) as $detail) {
            $this->line("         {$detail}");
        }
    }
}
