<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Policies\RolePolicy;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Spatie\Permission\Models\Role;

/**
 * @mixin Role
 */
class RoleResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            // Read from the raw attribute bag. `$this->users_count` would go
            // through Model::getAttribute, which throws under the strict mode
            // enabled in local dev when the count was never set (store/update
            // responses do not compute it).
            'users_count' => $this->when(
                array_key_exists('users_count', $this->resource->getAttributes()),
                fn () => (int) $this->resource->getAttributes()['users_count'],
            ),
            'permissions' => $this->whenLoaded('permissions', fn () => $this->permissions->pluck('name')),
            'is_protected' => in_array($this->name, RolePolicy::PROTECTED_ROLES, true),
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
