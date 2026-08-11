<?php

declare(strict_types=1);

namespace App\Console\Commands;

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
