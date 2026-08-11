<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Models\Account;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @mixin Account
 */
class AccountResource extends JsonResource
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
            'parent_id' => $this->parent_id,
            'is_group' => $this->is_group,
            'is_system' => $this->is_system,
            'system_key' => $this->system_key,
            'is_active' => $this->is_active,
            'opening_balance' => $this->opening_balance,
            'description' => $this->description,
            'type' => $this->whenLoaded('type', fn () => [
                'id' => $this->type->id,
                'code' => $this->type->code,
                'name' => $this->type->name,
                'category' => $this->type->category->value,
                'category_label' => $this->type->category->label(),
                'normal_balance' => $this->type->normal_balance->value,
            ]),

            // Only when the caller asked for it: this is a SUM over the whole
            // ledger and has no business running for every row of a list.
            'balance' => $this->when(
                $request->boolean('with_balance'),
                fn () => $this->balanceAsOf($request->string('as_of')->value() ?: null)->value(),
            ),
        ];
    }
}
