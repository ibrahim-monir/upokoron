<?php

declare(strict_types=1);

namespace App\Services\Accounting;

use App\Enums\FiscalPeriodStatus;
use App\Exceptions\BusinessRuleException;
use App\Exceptions\ClosedPeriodException;
use App\Models\FiscalPeriod;
use App\Models\FiscalYear;
use Carbon\CarbonInterface;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

class PeriodService
{
    /**
     * The period a date belongs to, refusing if it is closed.
     *
     * Every posting goes through here. Together with the immutability rules on
     * JournalEntry, this is what guarantees that a report for a closed month
     * returns the same numbers next year as it does today.
     */
    public function resolveOpenPeriodFor(CarbonInterface|string $date): FiscalPeriod
    {
        $date = $this->toDateString($date);

        $period = FiscalPeriod::containing($date)->first();

        if ($period === null) {
            throw ClosedPeriodException::noPeriod($date);
        }

        if (! $period->isOpen()) {
            throw ClosedPeriodException::forDate($date, $period->name);
        }

        // A year can be closed as a whole even while a stray period row still
        // reads open, so check both.
        if (! $period->fiscalYear->isOpen()) {
            throw ClosedPeriodException::forDate($date, $period->fiscalYear->name);
        }

        return $period;
    }

    public function periodFor(CarbonInterface|string $date): ?FiscalPeriod
    {
        return FiscalPeriod::containing($this->toDateString($date))->first();
    }

    /**
     * Create a fiscal year and its monthly periods.
     *
     * Bangladesh's statutory fiscal year runs July to June, which is the
     * default; a store keeping books on the calendar year can pass its own
     * start date.
     */
    public function createFiscalYear(CarbonInterface|string $startDate, ?string $name = null): FiscalYear
    {
        $start = Carbon::parse($this->toDateString($startDate))->startOfDay();
        $end = $start->copy()->addYear()->subDay();

        $name ??= $start->year === $end->year
            ? (string) $start->year
            : "{$start->year}-{$end->format('y')}";

        return DB::transaction(function () use ($start, $end, $name): FiscalYear {
            $this->assertNoOverlap($start, $end);

            $year = FiscalYear::create([
                'name' => $name,
                'start_date' => $start->toDateString(),
                'end_date' => $end->toDateString(),
                'status' => FiscalPeriodStatus::Open,
            ]);

            $cursor = $start->copy();

            while ($cursor->lessThanOrEqualTo($end)) {
                $periodEnd = $cursor->copy()->endOfMonth();

                $year->periods()->create([
                    'name' => $cursor->format('M Y'),
                    'start_date' => $cursor->toDateString(),
                    'end_date' => $periodEnd->min($end)->toDateString(),
                    'status' => FiscalPeriodStatus::Open,
                ]);

                $cursor = $cursor->copy()->addMonthNoOverflow()->startOfMonth();
            }

            return $year->load('periods');
        });
    }

    /**
     * Close a period. Everything before it must already be closed, otherwise
     * a later correction could still land in an earlier month and change a
     * comparative figure that has already been reported.
     */
    public function closePeriod(FiscalPeriod $period, ?int $userId = null): FiscalPeriod
    {
        if (! $period->isOpen()) {
            throw new BusinessRuleException(
                "Period [{$period->name}] is already closed.",
                'period_already_closed',
            );
        }

        $earlierOpen = FiscalPeriod::where('end_date', '<', $period->start_date)
            ->where('status', FiscalPeriodStatus::Open->value)
            ->orderBy('start_date')
            ->first();

        if ($earlierOpen !== null) {
            throw new BusinessRuleException(
                "Close [{$earlierOpen->name}] first. Periods must be closed in order.",
                'earlier_period_open',
                ['earliest_open_period' => $earlierOpen->name],
            );
        }

        $period->update([
            'status' => FiscalPeriodStatus::Closed,
            'closed_at' => now(),
            'closed_by' => $userId,
        ]);

        return $period->fresh();
    }

    /**
     * Reopening exists because mistakes are found after a close. It is
     * deliberately a separate, permissioned action rather than a side effect.
     */
    public function reopenPeriod(FiscalPeriod $period, ?int $userId = null): FiscalPeriod
    {
        if ($period->isOpen()) {
            return $period;
        }

        if (! $period->fiscalYear->isOpen()) {
            throw new BusinessRuleException(
                "Fiscal year [{$period->fiscalYear->name}] is closed. Reopen the year first.",
                'fiscal_year_closed',
            );
        }

        $period->update(['status' => FiscalPeriodStatus::Open, 'closed_at' => null, 'closed_by' => null]);

        return $period->fresh();
    }

    private function assertNoOverlap(Carbon $start, Carbon $end): void
    {
        $overlapping = FiscalYear::where('start_date', '<=', $end->toDateString())
            ->where('end_date', '>=', $start->toDateString())
            ->first();

        if ($overlapping !== null) {
            throw new BusinessRuleException(
                "Fiscal year [{$overlapping->name}] already covers part of that range.",
                'fiscal_year_overlap',
                ['existing' => $overlapping->name],
            );
        }
    }

    private function toDateString(CarbonInterface|string $date): string
    {
        return $date instanceof CarbonInterface
            ? $date->toDateString()
            : Carbon::parse($date)->toDateString();
    }
}
