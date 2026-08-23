<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Services\Rewards\RewardPointsService;
use Illuminate\Console\Command;

/**
 * The two things reward points need a clock for, rather than a request:
 * crediting today's birthdays, and expiring lots that have aged past the
 * validity window.
 */
class ProcessRewardPoints extends Command
{
    protected $signature = 'rewards:process';

    protected $description = 'Award birthday bonuses due today and expire lapsed reward points';

    public function handle(RewardPointsService $rewards): int
    {
        $birthdays = $rewards->awardBirthdaysDueToday();
        $expired = $rewards->expireDue();

        $this->info("Birthday bonuses awarded: {$birthdays}");
        $this->info("Point lots expired: {$expired}");

        return self::SUCCESS;
    }
}
