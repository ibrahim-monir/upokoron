<?php

declare(strict_types=1);

namespace App\Policies;

use App\Models\User;
use Spatie\Permission\Models\Role;

class UserPolicy
{
    public function viewAny(User $actor): bool
    {
        return $actor->can('users.view');
    }

    public function view(User $actor, User $user): bool
    {
        return $actor->can('users.view') || $actor->is($user);
    }

    public function create(User $actor): bool
    {
        return $actor->can('users.manage');
    }

    public function update(User $actor, User $user): bool
    {
        if (! $actor->can('users.manage')) {
            return false;
        }

        // Only an owner may edit another owner. Without this, a manager with
        // users.manage could deactivate the owner and take the store.
        if ($user->hasRole('owner') && ! $actor->hasRole('owner')) {
            return false;
        }

        return true;
    }

    public function delete(User $actor, User $user): bool
    {
        if (! $actor->can('users.manage')) {
            return false;
        }

        // Deleting your own account from the admin panel locks you out mid
        // request and leaves an orphaned session.
        if ($actor->is($user)) {
            return false;
        }

        if ($user->hasRole('owner')) {
            // Never remove the last owner -- the store would have nobody who
            // can manage roles or close a period.
            if (! $actor->hasRole('owner') || $this->ownerCount() <= 1) {
                return false;
            }
        }

        return true;
    }

    public function restore(User $actor, User $user): bool
    {
        return $actor->can('users.manage');
    }

    /**
     * Privilege escalation guard.
     *
     * An actor may only grant roles whose permissions they already hold
     * themselves. This is a general rule rather than a list of forbidden
     * roles, so it keeps working when new roles are added: a manager can
     * never mint an account more powerful than their own.
     *
     * @param  array<int, string>  $roleNames
     */
    public function assignRoles(User $actor, array $roleNames): bool
    {
        if ($roleNames === []) {
            return true;
        }

        if ($actor->hasRole('owner')) {
            return true;
        }

        if (! $actor->can('roles.manage') && ! $actor->can('users.manage')) {
            return false;
        }

        $actorPermissions = $actor->getAllPermissions()->pluck('name')->all();

        $granting = Role::whereIn('name', $roleNames)
            ->with('permissions')
            ->get()
            ->flatMap(fn (Role $role) => $role->permissions->pluck('name'))
            ->unique()
            ->all();

        return array_diff($granting, $actorPermissions) === [];
    }

    private function ownerCount(): int
    {
        return User::role('owner')->count();
    }
}
