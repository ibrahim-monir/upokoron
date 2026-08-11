<?php

declare(strict_types=1);

namespace Database\Seeders;

use App\Support\Permissions;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;

/**
 * Idempotent: syncs the database to whatever App\Support\Permissions declares.
 * Safe to re-run on every deploy, which is how new permissions introduced by
 * a later phase reach existing installations.
 */
class RolePermissionSeeder extends Seeder
{
    public function run(): void
    {
        app(PermissionRegistrar::class)->forgetCachedPermissions();

        DB::transaction(function (): void {
            $this->syncPermissions();
            $this->syncRoles();
        });

        app(PermissionRegistrar::class)->forgetCachedPermissions();
    }

    private function syncPermissions(): void
    {
        foreach (Permissions::names() as $name) {
            Permission::findOrCreate($name, 'web');
        }

        // Permissions removed from the registry are dropped, so a revoked
        // capability cannot linger on a role after a deploy.
        Permission::whereNotIn('name', Permissions::names())->delete();
    }

    private function syncRoles(): void
    {
        foreach (Permissions::roles() as $roleName => $permissions) {
            $role = Role::findOrCreate($roleName, 'web');

            $role->syncPermissions(
                $permissions === '*' ? Permissions::names() : $permissions
            );

            $this->command?->info("  role [{$roleName}] -> ".
                ($permissions === '*' ? 'all' : count($permissions)).' permissions');
        }
    }
}
