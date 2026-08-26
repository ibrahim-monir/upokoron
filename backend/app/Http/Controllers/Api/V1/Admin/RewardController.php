<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\RewardPointTransaction;
use App\Services\Rewards\RewardPointsService;
use App\Services\Support\SettingsService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * The loyalty program's back office: the rules it runs on, the balance every
 * customer is carrying, and a manual credit or debit with a reason attached.
 */
class RewardController extends Controller
{
    public function __construct(
        private readonly RewardPointsService $rewards,
        private readonly SettingsService $settings,
    ) {}

    public function settings(Request $request): JsonResponse
    {
        abort_unless($request->user()?->can('rewards.view'), 403);

        return response()->json(['data' => $this->rewards->settings()]);
    }

    public function updateSettings(Request $request): JsonResponse
    {
        abort_unless($request->user()?->can('rewards.adjust'), 403);

        $data = $request->validate([
            'rewards_enabled' => ['sometimes', 'boolean'],
            'show_points_on_product_page' => ['sometimes', 'boolean'],
            // min:1 -- the unit is a divisor.
            'earning_unit_bdt' => ['sometimes', 'integer', 'min:1', 'max:100000'],
            'points_per_hundred' => ['sometimes', 'integer', 'min:0', 'max:1000'],
            'review_points' => ['sometimes', 'integer', 'min:0', 'max:1000'],
            'profile_completion_points' => ['sometimes', 'integer', 'min:0', 'max:5000'],
            'birthday_points' => ['sometimes', 'integer', 'min:0', 'max:5000'],
            'redemption_rate' => ['sometimes', 'numeric', 'min:0', 'max:100'],
            'min_redeem_points' => ['sometimes', 'integer', 'min:0', 'max:100000'],
            'max_redeem_points' => ['sometimes', 'integer', 'min:0', 'max:100000'],
            'max_redeem_percent_of_order' => ['sometimes', 'integer', 'min:0', 'max:100'],
            'expiry_days' => ['sometimes', 'integer', 'min:0', 'max:3650'],
        ]);

        if (isset($data['min_redeem_points'], $data['max_redeem_points'])
            && $data['min_redeem_points'] > $data['max_redeem_points']) {
            abort(422, 'The minimum redemption cannot be more than the maximum.');
        }

        $this->settings->setMany($data);

        return response()->json([
            'message' => 'Reward point settings saved.',
            'data' => $this->rewards->settings(),
        ]);
    }

    public function customers(Request $request): JsonResponse
    {
        abort_unless($request->user()?->can('rewards.view'), 403);

        $customers = Customer::query()
            ->when($request->filled('search'), function ($query) use ($request): void {
                $term = '%'.$request->string('search')->trim().'%';

                $query->where(fn ($q) => $q->where('name', 'like', $term)
                    ->orWhere('phone', 'like', $term)
                    ->orWhere('email', 'like', $term)
                    ->orWhere('code', 'like', $term));
            })
            ->when($request->boolean('has_points'), fn ($q) => $q->where('reward_points_balance', '>', 0))
            ->orderByDesc('reward_points_balance')
            ->paginate(min(max($request->integer('per_page', 20), 1), 100));

        return response()->json([
            'data' => collect($customers->items())->map(fn (Customer $c): array => [
                'id' => $c->id,
                'code' => $c->code,
                'name' => $c->name,
                'phone' => $c->phone,
                'email' => $c->email,
                'reward_points_balance' => (int) $c->reward_points_balance,
            ])->all(),
            'meta' => [
                'current_page' => $customers->currentPage(),
                'last_page' => $customers->lastPage(),
                'per_page' => $customers->perPage(),
                'total' => $customers->total(),
            ],
        ]);
    }

    public function history(Request $request, Customer $customer): JsonResponse
    {
        abort_unless($request->user()?->can('rewards.view'), 403);

        $transactions = $customer->rewardPointTransactions()
            ->with(['order:id,number', 'createdBy:id,name'])
            ->latest('id')
            ->paginate(min(max($request->integer('per_page', 20), 1), 100));

        return response()->json([
            'data' => collect($transactions->items())->map(fn (RewardPointTransaction $t): array => [
                'id' => $t->id,
                'type' => $t->type->value,
                'type_label' => $t->type->label(),
                'points' => $t->points,
                'note' => $t->note,
                'order_number' => $t->order?->number,
                'created_by' => $t->createdBy?->name,
                'expires_at' => $t->expires_at?->toIso8601String(),
                'created_at' => $t->created_at?->toIso8601String(),
            ])->all(),
            'meta' => [
                'current_page' => $transactions->currentPage(),
                'last_page' => $transactions->lastPage(),
                'per_page' => $transactions->perPage(),
                'total' => $transactions->total(),
            ],
        ]);
    }

    public function adjust(Request $request): JsonResponse
    {
        abort_unless($request->user()?->can('rewards.adjust'), 403);

        $data = $request->validate([
            'customer_id' => ['required', Rule::exists('customers', 'id')],
            'points' => ['required', 'integer', 'min:-100000', 'max:100000', 'not_in:0'],
            'reason' => ['required', 'string', 'max:255'],
        ]);

        $customer = Customer::findOrFail($data['customer_id']);

        $this->rewards->adjustManually($customer, (int) $data['points'], $data['reason'], $request->user());

        return response()->json([
            'message' => 'Points adjusted.',
            'data' => ['reward_points_balance' => (int) $customer->fresh()->reward_points_balance],
        ]);
    }
}
