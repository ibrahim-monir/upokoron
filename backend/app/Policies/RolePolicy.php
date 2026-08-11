<?php

declare(strict_types=1);

namespace App\Policies;

use App\Models\User;
use Spatie\Permission\Models\Role;

class RolePolicy
{
    /**
     * Roles the seeder owns. They may be inspected and their permissions
     * reviewed, but renaming or deleting them would break code that checks
     * hasRole('owner').
     *
     * @var array<int, string>
     */
    public const PROTECTED_ROLES = ['owner', 'customer'];

    public function viewAny(User $actor): bool
    {
        return $actor->can('roles.manage') || $actor->can('users.manage');
    }

    public function view(User $actor, Role $role): bool
    {
        return $this->viewAny($actor);
    }

    public function create(User $actor): bool
    {
        return $actor->can('roles.manage');
    }

    public function update(User $actor, Role $role): bool
    {
        if (! $actor->can('roles.manage')) {
            return false;
        }

        if (in_array($role->name, self::PROTECTED_ROLES, true) && ! $actor->hasRole('owner')) {
            return false;
        }

        return true;
    }

    public function delete(User $actor, Role $role): bool
    {
        if (! $actor->can('roles.manage')) {
            return false;
        }

        // Built-in roles are referenced by name in code and by the seeder.
        if (in_array($role->name, self::PROTECTED_ROLES, true)) {
            return false;
        }

        // A role still in use would silently strip access from real accounts.
        return $role->users()->count() === 0;
    }
}
