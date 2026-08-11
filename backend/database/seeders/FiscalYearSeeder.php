<?php

declare(strict_types=1);

namespace Database\Seeders;

use App\Models\FiscalYear;
use App\Services\Accounting\PeriodService;
use Illuminate\Database\Seeder;
use Illuminate\Support\Carbon;

/**
 * Creates the fiscal year covering today, so a fresh install can post
 * immediately instead of failing on the first order with "no period".
 *
 * Bangladesh's statutory fiscal year runs 1 July to 30 June.
 */
class FiscalYearSeeder extends Seeder
{
    public function run(): void
    {
        $today = Carbon::now(config('upokoron.display_timezone'));

        // Before July we are still inside the year that began last July.
        $start = $today->month >= 7
            ? Carbon::create($today->year, 7, 1)
            : Carbon::create($today->year - 1, 7, 1);

        $existing = FiscalYear::where('start_date', '<=', $today->toDateString())
            ->where('end_date', '>=', $today->toDateString())
            ->first();

        if ($existing !== null) {
            $this->command?->info("  fiscal year already exists: {$existing->name}");

            return;
        }

        $year = app(PeriodService::class)->createFiscalYear($start);

        $this->command?->info("  fiscal year {$year->name}: {$year->periods->count()} periods");
    }
}
