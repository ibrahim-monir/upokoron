<?php

declare(strict_types=1);

namespace App\Services\Accounting;

use App\Enums\NormalBalance;
use App\Models\Account;
use App\Models\JournalEntryLine;
use App\Support\Money;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;

class LedgerService
{
    /**
     * A running account ledger: opening balance, every movement, closing
     * balance.
     *
     * @return array<string, mixed>
     */
    public function accountLedger(Account $account, ?string $from = null, ?string $to = null): array
    {
        $opening = $this->openingBalance($account, $from);
        $running = $opening;

        $lines = JournalEntryLine::with(['entry:id,number,event,entry_date,memo,status'])
            ->where('account_id', $account->id)
            ->between($from, $to)
            ->join('journal_entries', 'journal_entries.id', '=', 'journal_entry_lines.journal_entry_id')
            ->orderBy('journal_entry_lines.entry_date')
            ->orderBy('journal_entries.number')
            ->orderBy('journal_entry_lines.line_no')
            ->select('journal_entry_lines.*')
            ->get();

        $sign = $account->normalBalance()->sign();
        $rows = [];

        foreach ($lines as $line) {
            $movement = $line->movement();

            $running = $sign === 1
                ? $running->plus($movement)
                : $running->minus($movement);

            $rows[] = [
                'date' => $line->entry_date->toDateString(),
                'entry_number' => $line->entry->number,
                'event' => $line->entry->event,
                'memo' => $line->memo ?? $line->entry->memo,
                'debit' => $line->debit,
                'credit' => $line->credit,
                'balance' => $running->value(),
            ];
        }

        return [
            'account' => [
                'id' => $account->id,
                'code' => $account->code,
                'name' => $account->name,
                'category' => $account->category()->value,
                'normal_balance' => $account->normalBalance()->value,
            ],
            'from' => $from,
            'to' => $to,
            'opening_balance' => $opening->value(),
            'closing_balance' => $running->value(),
            'rows' => $rows,
        ];
    }

    /**
     * A party's ledger, derived from the general ledger rather than stored
     * separately.
     *
     * This is why the customer ledger can never disagree with the Accounts
     * Receivable control account: there is only one set of numbers, filtered
     * two different ways.
     *
     * @return array<string, mixed>
     */
    public function partyLedger(Model $party, ?string $from = null, ?string $to = null): array
    {
        $type = $party->getMorphClass();
        $id = $party->getKey();

        $openingRow = DB::table('journal_entry_lines')
            ->selectRaw('COALESCE(SUM(debit), 0) as d, COALESCE(SUM(credit), 0) as c')
            ->where('party_type', $type)
            ->where('party_id', $id)
            ->when($from !== null, fn ($q) => $q->where('entry_date', '<', $from))
            ->first();

        // Positive means the party owes the business: correct for a customer
        // (receivable) and inverted for a supplier, whose ledger the caller
        // presents from the payable side.
        $opening = Money::of($openingRow->d)->minus(Money::of($openingRow->c));
        $running = $opening;

        $lines = JournalEntryLine::with(['entry:id,number,event,entry_date,memo', 'account:id,code,name'])
            ->forParty($type, $id)
            ->between($from, $to)
            ->orderBy('entry_date')
            ->orderBy('journal_entry_id')
            ->orderBy('line_no')
            ->get();

        $rows = [];

        foreach ($lines as $line) {
            $running = $running->plus($line->movement());

            $rows[] = [
                'date' => $line->entry_date->toDateString(),
                'entry_number' => $line->entry->number,
                'event' => $line->entry->event,
                'account' => $line->account->code.' '.$line->account->name,
                'memo' => $line->memo ?? $line->entry->memo,
                'debit' => $line->debit,
                'credit' => $line->credit,
                'balance' => $running->value(),
            ];
        }

        return [
            'party_type' => class_basename($type),
            'party_id' => $id,
            'from' => $from,
            'to' => $to,
            'opening_balance' => $opening->value(),
            'closing_balance' => $running->value(),
            'rows' => $rows,
        ];
    }

    /**
     * A party's outstanding balance, straight from the ledger.
     */
    public function partyBalance(Model $party, ?string $asOf = null): Money
    {
        $row = DB::table('journal_entry_lines')
            ->selectRaw('COALESCE(SUM(debit), 0) as d, COALESCE(SUM(credit), 0) as c')
            ->where('party_type', $party->getMorphClass())
            ->where('party_id', $party->getKey())
            ->when($asOf !== null, fn ($q) => $q->where('entry_date', '<=', $asOf))
            ->first();

        return Money::of($row->d)->minus(Money::of($row->c));
    }

    private function openingBalance(Account $account, ?string $before): Money
    {
        $query = DB::table('journal_entry_lines')
            ->selectRaw('COALESCE(SUM(debit), 0) as d, COALESCE(SUM(credit), 0) as c')
            ->where('account_id', $account->id);

        if ($before !== null) {
            $query->where('entry_date', '<', $before);
        } else {
            // No start date: the ledger starts at the account's own opening
            // balance and nothing has moved yet.
            return Money::of($account->opening_balance);
        }

        $row = $query->first();
        $movement = Money::of($row->d)->minus(Money::of($row->c));

        $balance = Money::of($account->opening_balance)->plus($movement);

        return $account->normalBalance() === NormalBalance::Debit ? $balance : $balance->negated();
    }
}
