<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\Account;
use App\Models\FiscalPeriod;
use App\Models\FiscalYear;
use App\Services\Accounting\LedgerService;
use App\Services\Accounting\PeriodService;
use App\Services\Accounting\TrialBalanceService;
use App\Support\Money;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AccountingReportController extends Controller
{
    public function __construct(
        private readonly TrialBalanceService $trial,
        private readonly LedgerService $ledger,
        private readonly PeriodService $periods,
    ) {}

    public function trialBalance(Request $request): JsonResponse
    {
        $this->authorizeFinancial($request);

        $request->validate([
            'from' => ['nullable', 'date'],
            'as_of' => ['nullable', 'date'],
        ]);

        return response()->json(
            $this->trial->build($request->input('as_of'), $request->input('from'))
        );
    }

    /**
     * Profit and loss, derived from the same ledger the trial balance reads.
     *
     * There is no second source of truth here: if this disagrees with the
     * trial balance, one of them has a bug, and `accounting:check` will say so.
     */
    public function profitAndLoss(Request $request): JsonResponse
    {
        $this->authorizeFinancial($request);

        $request->validate([
            'from' => ['nullable', 'date'],
            'to' => ['nullable', 'date', 'after_or_equal:from'],
        ]);

        $from = $request->input('from');
        $to = $request->input('to');

        $totals = $this->trial->categoryTotals($to, $from);

        $revenue = Money::of($totals['revenue']);
        $cogs = Money::of($totals['cogs']);
        $expenses = Money::of($totals['expense']);

        $grossProfit = $revenue->minus($cogs);
        $netProfit = $grossProfit->minus($expenses);

        return response()->json([
            'from' => $from,
            'to' => $to,
            'net_sales' => $revenue->value(),
            'cost_of_goods_sold' => $cogs->value(),
            'gross_profit' => $grossProfit->value(),
            'operating_expenses' => $expenses->value(),
            'net_profit' => $netProfit->value(),
            // Multiply BEFORE dividing. Money rounds to two decimals on every
            // operation, so dividing first turns 2000/7500 into 0.27 and then
            // reports the margin as 27.00% instead of 26.67%.
            'gross_margin_percent' => $revenue->isZero()
                ? '0.00'
                : $grossProfit->times('100')->dividedBy($revenue->value())->value(),
            'net_margin_percent' => $revenue->isZero()
                ? '0.00'
                : $netProfit->times('100')->dividedBy($revenue->value())->value(),
            'breakdown' => $this->breakdown($from, $to),
        ]);
    }

    public function accountLedger(Request $request, Account $account): JsonResponse
    {
        $this->authorizeFinancial($request);

        $request->validate([
            'from' => ['nullable', 'date'],
            'to' => ['nullable', 'date', 'after_or_equal:from'],
        ]);

        return response()->json(
            $this->ledger->accountLedger($account, $request->input('from'), $request->input('to'))
        );
    }

    // ─── Fiscal periods ──────────────────────────────────────────────────

    public function periods(Request $request): JsonResponse
    {
        abort_unless($request->user()?->can('accounting.view'), 403);

        return response()->json([
            'data' => FiscalYear::with('periods')->orderBy('start_date')->get()->map(fn (FiscalYear $y) => [
                'id' => $y->id,
                'name' => $y->name,
                'start_date' => $y->start_date->toDateString(),
                'end_date' => $y->end_date->toDateString(),
                'status' => $y->status->value,
                'periods' => $y->periods->map(fn (FiscalPeriod $p) => [
                    'id' => $p->id,
                    'name' => $p->name,
                    'start_date' => $p->start_date->toDateString(),
                    'end_date' => $p->end_date->toDateString(),
                    'status' => $p->status->value,
                    'closed_at' => $p->closed_at?->toIso8601String(),
                ]),
            ]),
        ]);
    }

    public function createFiscalYear(Request $request): JsonResponse
    {
        abort_unless($request->user()?->can('accounting.close_period'), 403);

        $validated = $request->validate([
            'start_date' => ['required', 'date'],
            'name' => ['nullable', 'string', 'max:30', 'unique:fiscal_years,name'],
        ]);

        $year = $this->periods->createFiscalYear($validated['start_date'], $validated['name'] ?? null);

        return response()->json([
            'message' => "Fiscal year {$year->name} created with {$year->periods->count()} periods.",
            'fiscal_year' => ['id' => $year->id, 'name' => $year->name],
        ], 201);
    }

    public function closePeriod(Request $request, FiscalPeriod $period): JsonResponse
    {
        abort_unless($request->user()?->can('accounting.close_period'), 403);

        $closed = $this->periods->closePeriod($period, $request->user()->id);

        return response()->json([
            'message' => "Period {$closed->name} closed. Nothing can post into it now.",
            'period' => ['id' => $closed->id, 'name' => $closed->name, 'status' => $closed->status->value],
        ]);
    }

    public function reopenPeriod(Request $request, FiscalPeriod $period): JsonResponse
    {
        abort_unless($request->user()?->can('accounting.close_period'), 403);

        $reopened = $this->periods->reopenPeriod($period, $request->user()->id);

        return response()->json([
            'message' => "Period {$reopened->name} reopened.",
            'period' => ['id' => $reopened->id, 'name' => $reopened->name, 'status' => $reopened->status->value],
        ]);
    }

    /**
     * Per-account figures behind the profit and loss headline.
     *
     * @return array<string, array<int, array<string, string>>>
     */
    private function breakdown(?string $from, ?string $to): array
    {
        $rows = $this->trial->build($to, $from)['rows'];

        $group = fn (array $categories) => collect($rows)
            ->filter(fn (array $r) => in_array($r['category'], $categories, true))
            ->map(fn (array $r) => [
                'code' => $r['code'],
                'name' => $r['name'],
                'amount' => Money::of($r['debit'])->minus($r['credit'])->abs()->value(),
            ])
            ->values()
            ->all();

        return [
            'revenue' => $group(['revenue']),
            'cost_of_goods_sold' => $group(['cogs']),
            'expenses' => $group(['expense']),
        ];
    }

    private function authorizeFinancial(Request $request): void
    {
        abort_unless(
            $request->user()?->can('reports.financial') || $request->user()?->can('accounting.view'),
            403,
            'You do not have access to financial reports.',
        );
    }
}
