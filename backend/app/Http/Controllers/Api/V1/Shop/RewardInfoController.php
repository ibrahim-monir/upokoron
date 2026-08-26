<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1\Shop;

use App\Http\Controllers\Controller;
use App\Services\Rewards\RewardPointsService;
use App\Services\Support\SettingsService;
use App\Support\Money;
use Illuminate\Http\JsonResponse;

class RewardInfoController extends Controller
{
    public function __construct(
        private readonly SettingsService $settings,
        private readonly RewardPointsService $rewards,
    ) {}

    /**
     * The terms of the rewards programme, for the page that explains it.
     *
     * A hand-picked set rather than making the whole `rewards` settings
     * group public: `referral_points` is held for a feature that does not
     * exist yet, and the redemption caps are the shop's business.
     *
     * `advertised` carries the quiet-mode switch. A shop can run the
     * programme -- crediting purchases the whole time -- without telling
     * anyone yet, and when it does, this page and its links stay away.
     */
    public function show(): JsonResponse
    {
        $enabled = (bool) $this->settings->get('rewards_enabled', true);
        $advertised = $enabled && (bool) $this->settings->get('show_points_on_product_page', true);

        if (! $advertised) {
            return response()->json(['data' => ['advertised' => false]]);
        }

        return response()->json([
            'data' => [
                'advertised' => true,

                // Earning.
                'earn_points' => (int) $this->settings->get('points_per_hundred', 1),
                'earn_per_amount' => Money::of($this->rewards->earningUnit())->value(),
                'review_points' => (int) $this->settings->get('review_points', 0),
                'profile_points' => (int) $this->settings->get('profile_completion_points', 0),
                'birthday_points' => (int) $this->settings->get('birthday_points', 0),

                // Spending.
                'point_value' => Money::of((string) $this->settings->get('redemption_rate', '1.00'))->value(),
                'min_redeem' => (int) $this->settings->get('min_redeem_points', 0),
                'max_redeem' => (int) $this->settings->get('max_redeem_points', 0),
                'max_percent' => (int) $this->settings->get('max_redeem_percent_of_order', 0),

                'expiry_days' => (int) $this->settings->get('expiry_days', 0),
            ],
        ]);
    }
}
