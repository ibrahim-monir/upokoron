<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1\Admin;

use App\Enums\CouponType;
use App\Exceptions\BusinessRuleException;
use App\Http\Controllers\Controller;
use App\Models\Coupon;
use App\Models\Order;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

/**
 * Discount codes.
 *
 * A coupon that has ever been redeemed keeps its row forever, the same as a
 * payment method that appears on a past order: deleting it would blank
 * "coupon used" off every invoice that named it. Deactivating is how a spent
 * or retired code is taken out of circulation instead.
 */
class CouponController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        abort_unless($request->user()?->can('coupons.manage'), 403);

        $coupons = Coupon::query()->orderByDesc('id')->get();

        return response()->json(['data' => $coupons->map(fn (Coupon $c): array => $this->present($c))->all()]);
    }

    public function store(Request $request): JsonResponse
    {
        abort_unless($request->user()?->can('coupons.manage'), 403);

        $data = $this->validated($request);
        $data['code'] = Str::upper($data['code']);
        $data['created_by'] = Auth::id();

        $coupon = Coupon::create($data);

        return response()->json(['data' => $this->present($coupon)], 201);
    }

    public function update(Request $request, Coupon $coupon): JsonResponse
    {
        abort_unless($request->user()?->can('coupons.manage'), 403);

        $data = $this->validated($request, $coupon, partial: true);

        if (isset($data['code'])) {
            $data['code'] = Str::upper($data['code']);
        }

        $coupon->update($data);

        return response()->json(['data' => $this->present($coupon->refresh())]);
    }

    public function destroy(Request $request, Coupon $coupon): JsonResponse
    {
        abort_unless($request->user()?->can('coupons.manage'), 403);

        if (Order::where('coupon_id', $coupon->id)->exists()) {
            throw new BusinessRuleException(
                "\"{$coupon->code}\" has been redeemed on past orders and cannot be deleted. Turn it off instead.",
                'coupon_in_use',
                ['coupon_id' => $coupon->id],
            );
        }

        $coupon->delete();

        return response()->json(['message' => 'Coupon removed.']);
    }

    /**
     * @return array<string, mixed>
     */
    private function validated(Request $request, ?Coupon $coupon = null, bool $partial = false): array
    {
        $required = $partial ? 'sometimes' : 'required';

        $data = $request->validate([
            'code' => [
                $required, 'string', 'max:40', 'alpha_dash',
                Rule::unique('coupons', 'code')->ignore($coupon)->whereNull('deleted_at'),
            ],
            'name' => ['nullable', 'string', 'max:120'],
            'type' => [$required, Rule::in(array_column(CouponType::cases(), 'value'))],
            'value' => [$required, 'numeric', 'min:0', 'max:99999999'],
            'max_discount_amount' => ['nullable', 'numeric', 'min:0', 'max:99999999'],
            'min_order_total' => ['nullable', 'numeric', 'min:0', 'max:99999999'],
            'usage_limit' => ['nullable', 'integer', 'min:1'],
            'usage_limit_per_customer' => ['nullable', 'integer', 'min:1'],
            'customer_group_id' => ['nullable', Rule::exists('customer_groups', 'id')],
            'starts_at' => ['nullable', 'date'],
            'expires_at' => ['nullable', 'date', 'after:starts_at'],
            'is_active' => ['sometimes', 'boolean'],
        ]);

        // A percentage over 100 is never intentional, and the fixed-amount
        // case has no such ceiling.
        $type = $data['type'] ?? $coupon?->type?->value;

        if ($type === CouponType::Percentage->value && isset($data['value']) && (float) $data['value'] > 100) {
            abort(422, 'A percentage discount cannot be more than 100.');
        }

        return $data;
    }

    /**
     * @return array<string, mixed>
     */
    private function present(Coupon $coupon): array
    {
        return [
            'id' => $coupon->id,
            'code' => $coupon->code,
            'name' => $coupon->name,
            'type' => $coupon->type->value,
            'type_label' => $coupon->type->label(),
            'value' => $coupon->value,
            'max_discount_amount' => $coupon->max_discount_amount,
            'min_order_total' => $coupon->min_order_total,
            'usage_limit' => $coupon->usage_limit,
            'usage_limit_per_customer' => $coupon->usage_limit_per_customer,
            'used_count' => $coupon->used_count,
            'customer_group_id' => $coupon->customer_group_id,
            'starts_at' => $coupon->starts_at?->toIso8601String(),
            'expires_at' => $coupon->expires_at?->toIso8601String(),
            'is_active' => $coupon->is_active,
            'is_within_window' => $coupon->isWithinWindow(),
        ];
    }
}
