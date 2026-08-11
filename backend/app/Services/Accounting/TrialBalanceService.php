<?php

declare(strict_types=1);

namespace App\Services\Accounting;

use App\Enums\AccountCategory;
use App\Enums\NormalBalance;
use App\Models\Account;
use App\Support\Money;
use Illuminate\Support\Facades\DB;

class TrialBalanceService
{
    /**
     * Trial balance as of a date.
     *
     * Total debits must equal total credits. If they ever do not, the ledger
     * has been written by something other than JournalService, and the
     * `accounting:check` command will say so loudly.
     *
     * @return array{rows: array<int, array<string, mixed>>, total_debit: string, total_credit: string, balanced: bool, as_of: string}
     */
    public function build(?string $asOf = null, ?string $from = null): array
    {
        $movements = $this->movements($asOf, $from);

        $accounts = Account::with('type')
            ->where('is_group', false)
            ->orderBy('code')
            ->get();

        $rows = [];
        $totalDebit = Money::zero();
        $totalCredit = Money::zero();

        foreach ($accounts as $account) {
            $movement = $movements[$account->id] ?? ['debit' => '0', 'credit' => '0'];

            $debit = Money::of($movement['debit']);
            $credit = Money::of($movement['credit']);

            // An opening balance only belongs in a cumulative trial balance.
            // For a date-ranged one it would double-count.
            $opening = $from === null ? Money::of($account->opening_balance) : Money::zero();

            if ($account->normalBalance() === NormalBalance::Debit) {
                $debit = $debit->plus($opening);
            } else {
                $credit = $credit->plus($opening);
            }

            if ($debit->isZero() && $credit->isZero()) {
                continue;
            }

            // Net each account to a single side. An account showing both a
            // debit and a credit total is a working paper, not a trial balance.
            $net = $debit->minus($credit);
            $rowDebit = $net->isPositive() ? $net : Money::zero();
            $rowCredit = $net->isNegative() ? $net->abs() : Money::zero();

            $rows[] = [
                'account_id' => $account->id,
                'code' => $account->code,
                'name' => $account->name,
                'category' => $account->category()->value,
                'category_label' => $account->category()->label(),
                'normal_balance' => $account->normalBalance()->value,
                'debit' => $rowDebit->value(),
                'credit' => $rowCredit->value(),
            ];

            $totalDebit = $totalDebit->plus($rowDebit);
            $totalCredit = $totalCredit->plus($rowCredit);
        }

        return [
            'rows' => $rows,
            'total_debit' => $totalDebit->value(),
            'total_credit' => $totalCredit->value(),
            'balanced' => $totalDebit->equals($totalCredit),
            'from' => $from,
            'as_of' => $asOf ?? now(config('upokoron.display_timezone'))->toDateString(),
        ];
    }

    /**
     * Totals per category, which is what the profit and loss and balance
     * sheet are built from.
     *
     * @return array<string, string>
     */
    public function categoryTotals(?string $asOf = null, ?string $from = null): array
    {
        $trial = $this->build($asOf, $from);

        $totals = array_fill_keys(
            array_map(fn (AccountCategory $c) => $c->value, AccountCategory::cases()),
            Money::zero(),
        );

        foreach ($trial['rows'] as $row) {
            $signed = Money::of($row['debit'])->minus($row['credit']);

            /*
             * The sign comes from the CATEGORY's natural direction, not the
             * account's own. Contra accounts are exactly the ones where those
             * differ: Sales Returns is debit-normal but sits under Revenue, so
             * a debit to it must REDUCE revenue. Signing by the account's own
             * normal balance would instead add the return to sales and report
             * a refund as income.
             *
             * The same holds for Accumulated Depreciation, which is
             * credit-normal under Assets and correctly reduces total assets.
             */
            $category = AccountCategory::from($row['category']);

            if ($category->defaultNormalBalance() === NormalBalance::Credit) {
                $signed = $signed->negated();
            }

            $totals[$row['category']] = $totals[$row['category']]->plus($signed);
        }

        return array_map(fn (Money $m) => $m->value(), $totals);
    }

    /**
     * Raw debit and credit totals per account, in one query.
     *
     * @return array<int, array{debit: string, credit: string}>
     */
    private function movements(?string $asOf, ?string $from): array
    {
        return DB::table('journal_entry_lines')
            ->select('account_id')
            ->selectRaw('COALESCE(SUM(debit), 0) as debit_total')
            ->selectRaw('COALESCE(SUM(credit), 0) as credit_total')
            ->when($from !== null, fn ($q) => $q->where('entry_date', '>=', $from))
            ->when($asOf !== null, fn ($q) => $q->where('entry_date', '<=', $asOf))
            ->groupBy('account_id')
            ->get()
            ->mapWithKeys(fn ($row) => [
                (int) $row->account_id => [
                    'debit' => (string) $row->debit_total,
                    'credit' => (string) $row->credit_total,
                ],
            ])
            ->all();
    }
}
