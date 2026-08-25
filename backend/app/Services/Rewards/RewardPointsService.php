<?php

declare(strict_types=1);

namespace App\Services\Rewards;

use App\Enums\RewardPointType;
use App\Exceptions\BusinessRuleException;
use App\Models\Customer;
use App\Models\Order;
use App\Models\ProductReview;
use App\Models\RewardPointTransaction;
use App\Models\User;
use App\Services\Support\SettingsService;
use App\Support\Money;
use Illuminate\Support\Facades\DB;

/**
 * Earning, redeeming, and expiring loyalty points.
 *
 * `customers.reward_points_balance` is a running total, adjusted by exactly
 * one point in exactly one direction on every transaction row written here.
 * `remaining_points` on an earn row is a separate, secondary bookkeeping
 * detail -- which lot a later spend drew down from -- kept only so expiry
 * can tell an unspent point from one already redeemed. The balance column is
 * what every caller outside this service should trust.
 */
class RewardPointsService
{
    /**
     * BDT spent per earning "unit" -- the amount pointsForAmount() buckets a
     * purchase into before multiplying by the points-per-unit setting. Named
     * separately from that setting (which is still keyed 'points_per_hundred'
     * in the database for backward compatibility) so the two can be read
     * about together without the setting's own name implying a fixed 100.
     */
    private const EARNING_UNIT_BDT = '20';

    public function __construct(private readonly SettingsService $settings) {}

    /**
     * @return array<string, mixed>
     */
    public function settings(): array
    {
        return [
            'rewards_enabled' => $this->settings->bool('rewards_enabled', true),
            'show_points_on_product_page' => $this->settings->bool('show_points_on_product_page', true),
            'points_per_hundred' => $this->settings->int('points_per_hundred', 1),
            'review_points' => $this->settings->int('review_points', 10),
            'profile_completion_points' => $this->settings->int('profile_completion_points', 50),
            'birthday_points' => $this->settings->int('birthday_points', 200),
            'redemption_rate' => $this->settings->decimal('redemption_rate', '1.00'),
            'min_redeem_points' => $this->settings->int('min_redeem_points', 50),
            'max_redeem_points' => $this->settings->int('max_redeem_points', 200),
            'max_redeem_percent_of_order' => $this->settings->int('max_redeem_percent_of_order', 20),
            'expiry_days' => $this->settings->int('expiry_days', 365),
        ];
    }

    public function isEnabled(): bool
    {
        return $this->settings->bool('rewards_enabled', true);
    }

    /**
     * Whether the storefront should tell a shopper how many points a
     * product would earn them -- a separate switch from the program being
     * on at all, so a shop can credit purchases quietly before deciding to
     * advertise it.
     */
    public function shouldShowOnProductPage(): bool
    {
        return $this->isEnabled() && $this->settings->bool('show_points_on_product_page', true);
    }

    public function balance(Customer $customer): int
    {
        return (int) $customer->reward_points_balance;
    }

    /**
     * How many points a purchase of this size would earn, at today's rate.
     * Used both to credit a delivered order and to preview the figure on a
     * product page before anyone has bought anything.
     *
     * Whole units only, same as the old per-100 version: BDT 39 on top of a
     * clean multiple of the unit earns nothing until it rounds up to the
     * next one.
     */
    public function pointsForAmount(Money $amount): int
    {
        if (! $amount->isPositive()) {
            return 0;
        }

        $units = (int) bcdiv($amount->value(), self::EARNING_UNIT_BDT, 0);

        return $units * $this->settings->int('points_per_hundred', 1);
    }

    /**
     * The most points a customer may redeem against this cart right now:
     * whichever is smallest of what they hold, the per-order cap, and what
     * the cart is large enough to justify -- and zero rather than a partial
     * amount if that is still under the minimum redemption.
     */
    public function maxRedeemablePoints(Customer $customer, Money $subtotal): int
    {
        if (! $this->isEnabled()) {
            return 0;
        }

        $rules = $this->settings();

        $rate = Money::of($rules['redemption_rate']);

        if ($rate->isZero()) {
            return 0;
        }

        $capByOrderValue = $subtotal->times($rules['max_redeem_percent_of_order'])->dividedBy(100);
        $capByOrderValuePoints = (int) bcdiv($capByOrderValue->dividedBy($rate->value())->value(), '1', 0);

        $max = min(
            (int) $customer->reward_points_balance,
            $rules['max_redeem_points'],
            $capByOrderValuePoints,
        );

        return $max >= $rules['min_redeem_points'] ? $max : 0;
    }

    /**
     * Validate a requested redemption against the current rules and balance,
     * and say what it is worth. Does not write anything -- CartService calls
     * this on every read to keep a stale redemption from surviving a balance
     * or subtotal change.
     *
     * @return array{points: int, discount: Money}
     */
    public function previewRedemption(Customer $customer, int $points, Money $subtotal): array
    {
        if ($points <= 0) {
            return ['points' => 0, 'discount' => Money::zero()];
        }

        if (! $this->isEnabled()) {
            throw new BusinessRuleException('Reward points are not available right now.', 'rewards_disabled');
        }

        $rules = $this->settings();

        if ($points < $rules['min_redeem_points']) {
            throw new BusinessRuleException(
                "Redeem at least {$rules['min_redeem_points']} points.",
                'reward_points_below_minimum',
            );
        }

        $max = $this->maxRedeemablePoints($customer, $subtotal);

        if ($points > $max) {
            throw new BusinessRuleException(
                $max > 0
                    ? "You can redeem at most {$max} points on this order."
                    : 'This order does not qualify for a points redemption.',
                'reward_points_above_maximum',
                ['max' => $max],
            );
        }

        return ['points' => $points, 'discount' => Money::of($rules['redemption_rate'])->times($points)];
    }

    /**
     * Spend points against a placed order. Called from inside OrderService's
     * own transaction, so this re-locks and re-validates rather than trusting
     * whatever the cart last computed -- the basket could have sat open long
     * enough for the balance to have moved.
     */
    public function redeem(Customer $customer, int $points, Order $order): RewardPointTransaction
    {
        return DB::transaction(function () use ($customer, $points, $order): RewardPointTransaction {
            $locked = Customer::whereKey($customer->id)->lockForUpdate()->firstOrFail();

            if ($points > $locked->reward_points_balance) {
                throw new BusinessRuleException(
                    'Your points balance changed. Please review your order and try again.',
                    'reward_points_insufficient_balance',
                );
            }

            $transaction = new RewardPointTransaction;

            $transaction->forceFill([
                'customer_id' => $locked->id,
                'type' => RewardPointType::Redeemed,
                'points' => -$points,
                'order_id' => $order->id,
                'note' => "Redeemed on order {$order->number}",
            ])->save();

            $locked->decrement('reward_points_balance', $points);

            $this->consumeFifo($locked, $points);

            return $transaction;
        });
    }

    /**
     * Points earned on a delivered order, per EARNING_UNIT_BDT of the
     * product subtotal actually charged (after per-line discounts, before
     * shipping and any payment surcharge). Delivery is not something the
     * points program pays a customer to buy.
     */
    public function awardPurchase(Order $order): void
    {
        if (! $this->isEnabled() || $order->customer_id === null) {
            return;
        }

        if (RewardPointTransaction::where('order_id', $order->id)
            ->where('type', RewardPointType::Purchase->value)->exists()) {
            return;
        }

        $net = Money::of($order->subtotal)->minus($order->discount_total);
        $points = $this->pointsForAmount($net);

        if ($points <= 0) {
            return;
        }

        $customer = Customer::find($order->customer_id);

        if ($customer === null) {
            return;
        }

        $this->award($customer, RewardPointType::Purchase, $points, [
            'order_id' => $order->id,
            'note' => "Order {$order->number} delivered",
        ]);
    }

    /**
     * Points for a review the first time it is approved. Approved, then
     * later edited or unapproved, does not claw the points back -- the
     * customer already did the thing the reward was for.
     */
    public function awardReview(ProductReview $review): void
    {
        if (! $this->isEnabled()) {
            return;
        }

        if (RewardPointTransaction::where('product_review_id', $review->id)
            ->where('type', RewardPointType::Review->value)->exists()) {
            return;
        }

        $points = $this->settings->int('review_points', 10);

        if ($points <= 0) {
            return;
        }

        $customer = Customer::find($review->customer_id);

        if ($customer === null) {
            return;
        }

        $this->award($customer, RewardPointType::Review, $points, [
            'product_review_id' => $review->id,
            'note' => 'Approved product review',
        ]);
    }

    /**
     * A one-time bonus once name, phone and date of birth are all on file --
     * checked after every profile save, so it fires the moment the last of
     * the three is filled in, whichever one that is.
     */
    public function awardProfileCompletion(?Customer $customer): void
    {
        if ($customer === null || ! $this->isEnabled()) {
            return;
        }

        $isComplete = filled($customer->name) && filled($customer->phone) && filled($customer->date_of_birth);

        if (! $isComplete) {
            return;
        }

        if (RewardPointTransaction::where('customer_id', $customer->id)
            ->where('type', RewardPointType::ProfileCompletion->value)->exists()) {
            return;
        }

        $points = $this->settings->int('profile_completion_points', 50);

        if ($points <= 0) {
            return;
        }

        $this->award($customer, RewardPointType::ProfileCompletion, $points, [
            'note' => 'Name, phone and date of birth on file',
        ]);
    }

    /**
     * Birthday bonuses for every customer whose birthday is today and who
     * has not already had one this calendar year. Meant to run once a day
     * from the scheduler.
     */
    public function awardBirthdaysDueToday(): int
    {
        if (! $this->isEnabled()) {
            return 0;
        }

        $points = $this->settings->int('birthday_points', 200);

        if ($points <= 0) {
            return 0;
        }

        $today = now();
        $awarded = 0;

        Customer::query()
            ->whereNotNull('date_of_birth')
            ->whereMonth('date_of_birth', $today->month)
            ->whereDay('date_of_birth', $today->day)
            ->where('is_blocked', false)
            ->chunkById(200, function ($customers) use ($points, $today, &$awarded): void {
                foreach ($customers as $customer) {
                    $already = RewardPointTransaction::where('customer_id', $customer->id)
                        ->where('type', RewardPointType::Birthday->value)
                        ->whereYear('created_at', $today->year)
                        ->exists();

                    if ($already) {
                        continue;
                    }

                    $this->award($customer, RewardPointType::Birthday, $points, [
                        'note' => "Birthday bonus {$today->year}",
                    ]);

                    $awarded++;
                }
            });

        return $awarded;
    }

    /**
     * A staff member crediting or debiting a customer's balance directly,
     * with a reason on the record.
     */
    public function adjustManually(Customer $customer, int $delta, string $reason, User $by): RewardPointTransaction
    {
        if ($delta === 0) {
            throw new BusinessRuleException('Enter a non-zero number of points.', 'reward_points_zero_adjustment');
        }

        return DB::transaction(function () use ($customer, $delta, $reason, $by): RewardPointTransaction {
            $locked = Customer::whereKey($customer->id)->lockForUpdate()->firstOrFail();

            if ($delta < 0) {
                $take = -$delta;

                if ($take > $locked->reward_points_balance) {
                    throw new BusinessRuleException(
                        "This customer only has {$locked->reward_points_balance} points.",
                        'reward_points_insufficient_balance',
                    );
                }

                $transaction = new RewardPointTransaction;

                $transaction->forceFill([
                    'customer_id' => $locked->id,
                    'type' => RewardPointType::ManualDebit,
                    'points' => $delta,
                    'note' => $reason,
                    'created_by' => $by->id,
                ])->save();

                $locked->decrement('reward_points_balance', $take);

                $this->consumeFifo($locked, $take);

                return $transaction;
            }

            $transaction = new RewardPointTransaction;

            $transaction->forceFill([
                'customer_id' => $locked->id,
                'type' => RewardPointType::ManualCredit,
                'points' => $delta,
                'remaining_points' => $delta,
                'expires_at' => $this->expiryDate(),
                'note' => $reason,
                'created_by' => $by->id,
            ])->save();

            $locked->increment('reward_points_balance', $delta);

            return $transaction;
        });
    }

    /**
     * Expire whatever earn lots have aged past the validity window, oldest
     * first. Meant to run once a day from the scheduler.
     */
    public function expireDue(): int
    {
        $expired = 0;

        RewardPointTransaction::query()
            ->dueToExpire()
            ->chunkById(200, function ($lots) use (&$expired): void {
                foreach ($lots as $lot) {
                    DB::transaction(function () use ($lot): void {
                        $customer = Customer::whereKey($lot->customer_id)->lockForUpdate()->firstOrFail();

                        // Re-read the lot inside the lock: a redemption may
                        // have drawn it down between the query above and now.
                        $fresh = RewardPointTransaction::whereKey($lot->id)->lockForUpdate()->first();
                        $take = $fresh?->remaining_points ?? 0;

                        if ($take <= 0) {
                            return;
                        }

                        (new RewardPointTransaction)->forceFill([
                            'customer_id' => $customer->id,
                            'type' => RewardPointType::Expired->value,
                            'points' => -$take,
                            'note' => 'Points expired',
                        ])->save();

                        $fresh->forceFill(['remaining_points' => 0])->save();
                        $customer->decrement('reward_points_balance', $take);
                    });

                    $expired++;
                }
            });

        return $expired;
    }

    /**
     * Consume earn lots oldest-first for a spend of this size. Only affects
     * `remaining_points` bookkeeping -- the balance column was already moved
     * by the caller.
     */
    private function consumeFifo(Customer $customer, int $amount): void
    {
        $lots = RewardPointTransaction::where('customer_id', $customer->id)
            ->openLots()
            ->lockForUpdate()
            ->get();

        foreach ($lots as $lot) {
            if ($amount <= 0) {
                break;
            }

            $take = min($lot->remaining_points, $amount);
            $lot->decrement('remaining_points', $take);
            $amount -= $take;
        }
    }

    /**
     * @param  array<string, mixed>  $extra
     */
    private function award(Customer $customer, RewardPointType $type, int $points, array $extra = []): RewardPointTransaction
    {
        return DB::transaction(function () use ($customer, $type, $points, $extra): RewardPointTransaction {
            $locked = Customer::whereKey($customer->id)->lockForUpdate()->firstOrFail();

            $transaction = new RewardPointTransaction;

            $transaction->forceFill($extra + [
                'customer_id' => $locked->id,
                'type' => $type->value,
                'points' => $points,
                'remaining_points' => $points,
                'expires_at' => $this->expiryDate(),
            ])->save();

            $locked->increment('reward_points_balance', $points);

            return $transaction;
        });
    }

    private function expiryDate(): ?\Illuminate\Support\Carbon
    {
        $days = $this->settings->int('expiry_days', 365);

        return $days > 0 ? now()->addDays($days) : null;
    }
}
