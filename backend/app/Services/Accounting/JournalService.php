<?php

declare(strict_types=1);

namespace App\Services\Accounting;

use App\Enums\JournalEntryStatus;
use App\Exceptions\BusinessRuleException;
use App\Exceptions\DuplicateJournalEntryException;
use App\Exceptions\UnbalancedEntryException;
use App\Models\JournalEntry;
use App\Services\Support\DocumentNumberService;
use App\Support\Money;
use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;

/**
 * The single gateway into the general ledger.
 *
 * No other class may insert into journal_entries or journal_entry_lines --
 * the models themselves have empty $fillable and block updates and deletes,
 * and a feature test asserts nothing else writes to them. Concentrating every
 * posting here is what makes the two ledger invariants checkable in one place:
 *
 *   I1  every entry has SUM(debit) = SUM(credit)
 *   I2  no entry exists in a closed period
 *
 * Callers describe an entry with JournalLine::debit()/credit() and this class
 * validates, numbers, and writes it atomically.
 */
class JournalService
{
    /**
     * Events allowed to post without a source document.
     *
     * Everything else must name the document it came from, because the
     * idempotency index is (reference_type, reference_id, event) and MySQL
     * does not constrain rows whose indexed columns are NULL. A document
     * event posted with a null reference would therefore be duplicable, and
     * the loss of protection would be completely silent -- so it is rejected
     * outright instead. Manual journal entries genuinely have no natural key
     * and may legitimately repeat, hence the prefix.
     */
    private const UNREFERENCED_EVENT_PREFIX = 'manual.';

    public function __construct(
        private readonly AccountResolver $accounts,
        private readonly PeriodService $periods,
        private readonly DocumentNumberService $numbers,
    ) {}

    /**
     * Post a balanced entry.
     *
     * Throws if this event has already been posted for this document. Use
     * postOnce() where a retry is expected, such as a gateway webhook.
     *
     * @param  array<int, JournalLine>  $lines
     */
    public function post(
        string $event,
        array $lines,
        CarbonInterface|string|null $date = null,
        ?Model $reference = null,
        ?string $memo = null,
    ): JournalEntry {
        $date = $this->normaliseDate($date);

        $this->assertReferenceIsPresent($event, $reference);

        [$resolved, $totalDebit, $totalCredit] = $this->prepare($event, $lines);

        // Both checks happen before anything is written, so a rejected entry
        // leaves no trace and consumes no document number.
        $period = $this->periods->resolveOpenPeriodFor($date);

        return DB::transaction(function () use (
            $event, $resolved, $totalDebit, $totalCredit, $date, $reference, $memo, $period
        ): JournalEntry {
            try {
                $entry = JournalEntry::forceCreate([
                    'number' => $this->numbers->next('journal_entry', Carbon::parse($date)),
                    'entry_date' => $date,
                    'fiscal_period_id' => $period->id,
                    'reference_type' => $reference?->getMorphClass(),
                    'reference_id' => $reference?->getKey(),
                    'event' => $event,
                    'memo' => $memo,
                    'total_debit' => $totalDebit->value(),
                    'total_credit' => $totalCredit->value(),
                    'status' => JournalEntryStatus::Posted,
                    'created_by' => Auth::id(),
                    'posted_at' => now(),
                    'created_at' => now(),
                ]);
            } catch (UniqueConstraintViolationException $e) {
                // The unique index on (reference_type, reference_id, event) is
                // the last line of defence against a double post. Reaching it
                // means the caller's own state check let a retry through.
                throw DuplicateJournalEntryException::make(
                    $event,
                    $reference?->getMorphClass(),
                    $reference?->getKey(),
                );
            }

            $this->writeLines($entry, $resolved, $date);

            return $entry->load('lines.account');
        });
    }

    /**
     * Post, or return the entry already posted for this event.
     *
     * For genuinely idempotent callers: payment webhooks, retried queue jobs.
     * The caller gets the same entry back and no duplicate is created.
     *
     * @param  array<int, JournalLine>  $lines
     */
    public function postOnce(
        Model $reference,
        string $event,
        array $lines,
        CarbonInterface|string|null $date = null,
        ?string $memo = null,
    ): JournalEntry {
        $existing = JournalEntry::forSource($reference->getMorphClass(), $reference->getKey())
            ->where('event', $event)
            ->first();

        if ($existing !== null) {
            return $existing->load('lines.account');
        }

        try {
            return $this->post($event, $lines, $date, $reference, $memo);
        } catch (DuplicateJournalEntryException) {
            // Lost a race with a concurrent identical post; the winner's entry
            // is the correct answer for both callers.
            return JournalEntry::forSource($reference->getMorphClass(), $reference->getKey())
                ->where('event', $event)
                ->firstOrFail()
                ->load('lines.account');
        }
    }

    /**
     * Reverse an entry by posting its mirror image.
     *
     * The original is never edited or removed -- both entries stay in the
     * ledger and net to zero, which is what an auditor expects to see and
     * what keeps the audit trail honest.
     */
    public function reverse(
        JournalEntry $entry,
        string $reason,
        CarbonInterface|string|null $date = null,
    ): JournalEntry {
        if ($entry->isReversed()) {
            throw new BusinessRuleException(
                "Entry {$entry->number} has already been reversed by {$entry->reversedBy?->number}.",
                'already_reversed',
            );
        }

        if ($entry->isReversal()) {
            throw new BusinessRuleException(
                "Entry {$entry->number} is itself a reversal and cannot be reversed.",
                'cannot_reverse_a_reversal',
            );
        }

        // Default to today, not the original date: the original period is
        // often closed by the time an error is found, and back-dating a
        // reversal would silently restate a published month.
        $date = $this->normaliseDate($date);
        $period = $this->periods->resolveOpenPeriodFor($date);

        return DB::transaction(function () use ($entry, $reason, $date, $period): JournalEntry {
            $reversal = JournalEntry::forceCreate([
                'number' => $this->numbers->next('journal_entry', Carbon::parse($date)),
                'entry_date' => $date,
                'fiscal_period_id' => $period->id,
                'reference_type' => $entry->reference_type,
                'reference_id' => $entry->reference_id,
                'event' => $entry->event.'.reversal',
                'memo' => $reason,
                'total_debit' => $entry->total_credit,
                'total_credit' => $entry->total_debit,
                'status' => JournalEntryStatus::Reversal,
                'reversal_of_entry_id' => $entry->id,
                'reversal_reason' => $reason,
                'created_by' => Auth::id(),
                'posted_at' => now(),
                'created_at' => now(),
            ]);

            foreach ($entry->lines as $line) {
                $reversal->lines()->forceCreate([
                    'line_no' => $line->line_no,
                    'account_id' => $line->account_id,
                    'entry_date' => $date,
                    // Sides swapped: this is the whole reversal.
                    'debit' => $line->credit,
                    'credit' => $line->debit,
                    'party_type' => $line->party_type,
                    'party_id' => $line->party_id,
                    'memo' => $line->memo,
                ]);
            }

            // The model blocks updates, so the linkage on the original is
            // written through the query builder. This is the only mutation
            // ever made to a posted entry, and it touches no amounts.
            DB::table('journal_entries')
                ->where('id', $entry->id)
                ->update([
                    'status' => JournalEntryStatus::Reversed->value,
                    'reversed_by_entry_id' => $reversal->id,
                    'reversal_reason' => $reason,
                ]);

            return $reversal->load('lines.account');
        });
    }

    /**
     * Reverse whatever was posted for a document event, if anything was.
     * Used by cancellations, which must not fail merely because the document
     * never reached the stage that posts.
     */
    public function reverseFor(Model $reference, string $event, string $reason): ?JournalEntry
    {
        $entry = JournalEntry::forSource($reference->getMorphClass(), $reference->getKey())
            ->where('event', $event)
            ->where('status', JournalEntryStatus::Posted->value)
            ->first();

        return $entry === null ? null : $this->reverse($entry, $reason);
    }

    /**
     * Refuse a document event that names no document.
     *
     * See UNREFERENCED_EVENT_PREFIX: without a reference the unique index
     * cannot fire, so idempotency would be lost without any visible symptom.
     */
    private function assertReferenceIsPresent(string $event, ?Model $reference): void
    {
        if ($reference !== null || str_starts_with($event, self::UNREFERENCED_EVENT_PREFIX)) {
            return;
        }

        throw new BusinessRuleException(
            sprintf(
                'Event [%s] must name the document it came from. Journal idempotency relies on '.
                '(reference_type, reference_id, event), and MySQL does not enforce uniqueness across '.
                'NULLs -- so a null reference would silently allow this entry to be posted twice. '.
                'Pass the source model, or prefix the event with "%s" if it is a standalone manual entry.',
                $event,
                self::UNREFERENCED_EVENT_PREFIX,
            ),
            'journal_reference_required',
            ['event' => $event],
            500,
        );
    }

    /**
     * Validate the lines and total them.
     *
     * @param  array<int, JournalLine>  $lines
     * @return array{0: array<int, array{account_id: int, debit: string, credit: string, party_type: ?string, party_id: int|string|null, memo: ?string}>, 1: Money, 2: Money}
     */
    private function prepare(string $event, array $lines): array
    {
        if (count($lines) < 2) {
            throw new BusinessRuleException(
                "Journal entry for [{$event}] needs at least two lines; ".count($lines).' given.',
                'insufficient_journal_lines',
                [],
                500,
            );
        }

        $resolved = [];
        $totalDebit = Money::zero();
        $totalCredit = Money::zero();

        foreach ($lines as $line) {
            if (! $line instanceof JournalLine) {
                throw new BusinessRuleException(
                    'Journal lines must be JournalLine instances.',
                    'invalid_journal_line',
                    [],
                    500,
                );
            }

            $account = $this->accounts->resolve($line->account);

            $resolved[] = [
                'account_id' => $account->id,
                'debit' => $line->debit->value(),
                'credit' => $line->credit->value(),
                'party_type' => $line->partyType,
                'party_id' => $line->partyId,
                'memo' => $line->memo,
            ];

            $totalDebit = $totalDebit->plus($line->debit);
            $totalCredit = $totalCredit->plus($line->credit);
        }

        if (! $totalDebit->equals($totalCredit)) {
            throw UnbalancedEntryException::make($event, $totalDebit, $totalCredit);
        }

        if ($totalDebit->isZero()) {
            throw new BusinessRuleException(
                "Journal entry for [{$event}] totals zero and would record nothing.",
                'zero_value_journal_entry',
                [],
                500,
            );
        }

        return [$resolved, $totalDebit, $totalCredit];
    }

    /**
     * @param  array<int, array<string, mixed>>  $lines
     */
    private function writeLines(JournalEntry $entry, array $lines, string $date): void
    {
        $lineNo = 1;

        foreach ($lines as $line) {
            // forceCreate, because JournalEntryLine has an empty $fillable by
            // design: the only writer is this class.
            $entry->lines()->forceCreate($line + ['line_no' => $lineNo++, 'entry_date' => $date]);
        }
    }

    private function normaliseDate(CarbonInterface|string|null $date): string
    {
        if ($date === null) {
            // "Today" is today in Dhaka. In UTC it is already tomorrow for
            // six hours every evening, which would file evening entries into
            // the wrong day and, on month end, the wrong period.
            return Carbon::now(config('upokoron.display_timezone'))->toDateString();
        }

        return $date instanceof CarbonInterface
            ? $date->toDateString()
            : Carbon::parse($date)->toDateString();
    }
}
