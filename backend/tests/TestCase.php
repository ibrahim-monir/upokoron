<?php

declare(strict_types=1);

namespace Tests;

use App\Models\User;
use Database\Seeders\RolePermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Foundation\Testing\TestCase as BaseTestCase;
use Spatie\Permission\PermissionRegistrar;

abstract class TestCase extends BaseTestCase
{
    /**
     * Set to false in a test that wants to exercise a database with no roles.
     */
    protected bool $seedRoles = true;

    protected function setUp(): void
    {
        parent::setUp();

        if ($this->seedRoles && $this->usesDatabase()) {
            $this->seed(RolePermissionSeeder::class);
            app(PermissionRegistrar::class)->forgetCachedPermissions();
        }
    }

    /**
     * Create a user holding a role and authenticate as them.
     */
    protected function actingAsRole(string $role, array $attributes = []): User
    {
        $user = User::factory()->create($attributes);
        $user->assignRole($role);

        $this->actingAs($user->fresh());

        return $user;
    }

    /**
     * Create a user with specific permissions but no named role. Useful for
     * proving an endpoint checks the permission itself rather than the role.
     *
     * @param  array<int, string>  $permissions
     */
    protected function actingAsUserWithPermissions(array $permissions, array $attributes = []): User
    {
        $user = User::factory()->create($attributes);
        $user->givePermissionTo($permissions);

        $this->actingAs($user->fresh());

        return $user;
    }

    private function usesDatabase(): bool
    {
        return in_array(
            RefreshDatabase::class,
            class_uses_recursive(static::class),
            true,
        );
    }
}
