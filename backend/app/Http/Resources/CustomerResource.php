<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Enums\RewardPointType;
use App\Models\Customer;
use App\Models\RewardPointTransaction;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @mixin Customer
 */
class CustomerResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'code' => $this->code,
            'name' => $this->name,
            'phone' => $this->phone,
            'email' => $this->email,
            'gender' => $this->gender,
            'date_of_birth' => $this->date_of_birth?->toDateString(),

            // Whether the profile-completion bonus has been paid, and so
            // whether phone and date of birth are now fixed. Computed only
            // for the shopper looking at their own account -- the admin
            // customer list renders this resource by the hundred and has no
            // use for it.
            'profile_locked' => $this->when(
                $request->user()?->customer?->id === $this->id,
                fn (): bool => RewardPointTransaction::where('customer_id', $this->id)
                    ->where('type', RewardPointType::ProfileCompletion->value)
                    ->exists(),
            ),
            'group' => $this->whenLoaded('group', fn () => [
                'id' => $this->group?->id,
                'name' => $this->group?->name,
            ]),
            'total_orders' => (int) $this->total_orders,
            'total_spent' => (string) $this->total_spent,
            'reward_points_balance' => (int) $this->reward_points_balance,
            'last_order_at' => $this->last_order_at?->toIso8601String(),
            'is_blocked' => $this->is_blocked,
            'addresses' => CustomerAddressResource::collection($this->whenLoaded('addresses')),
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
