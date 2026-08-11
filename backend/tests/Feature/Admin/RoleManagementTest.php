<?php

declare(strict_types=1);

namespace Tests\Feature\Admin;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

class RoleManagementTest extends TestCase
{
    use RefreshDatabase;

    public function test_an_owner_can_list_roles_with_their_permissions(): void
    {
        $this->actingAsRole('owner');

        $this->getJson('/api/v1/admin/roles')
            ->assertOk()
            ->assertJsonFragment(['name' => 'accountant']);
    }

    public function test_the_permission_catalogue_is_grouped(): void
    {
        $this->actingAsRole('owner');

        $this->getJson('/api/v1/admin/permissions')
            ->assertOk()
            ->assertJsonStructure(['data' => ['General', 'Catalog', 'Inventory', 'Money']]);
    }

    public function test_an_owner_can_create_a_role(): void
    {
        $this->actingAsRole('owner');

        $this->postJson('/api/v1/admin/roles', [
            'name' => 'stock_clerk',
            'permissions' => ['admin.access', 'inventory.view'],
        ])->assertCreated();

        $role = Role::firstWhere('name', 'stock_clerk');

        $this->assertTrue($role->hasPermissionTo('inventory.view'));
    }

    public function test_a_role_cannot_be_given_an_unknown_permission(): void
    {
        $this->actingAsRole('owner');

        $this->postJson('/api/v1/admin/roles', [
            'name' => 'bad_role',
            'permissions' => ['not.a.real.permission'],
        ])->assertStatus(422)->assertJsonValidationErrors('permissions.0');
    }

    public function test_a_non_owner_cannot_grant_permissions_they_do_not_hold(): void
    {
        // A manager has no accounting.post permission of their own.
        $manager = User::factory()->create();
        $manager->assignRole('manager');
        $manager->givePermissionTo('roles.manage');
        $this->actingAs($manager->fresh());

        $this->postJson('/api/v1/admin/roles', [
            'name' => 'sneaky_role',
            'permissions' => ['accounting.post'],
        ])->assertForbidden();

        $this->assertDatabaseMissing('roles', ['name' => 'sneaky_role']);
    }

    public function test_protected_roles_cannot_be_deleted(): void
    {
        $this->actingAsRole('owner');

        $owner = Role::firstWhere('name', 'owner');

        $this->deleteJson("/api/v1/admin/roles/{$owner->id}")->assertForbidden();

        $this->assertDatabaseHas('roles', ['name' => 'owner']);
    }

    public function test_a_role_still_assigned_to_users_cannot_be_deleted(): void
    {
        $this->actingAsRole('owner');
        User::factory()->role('support')->create();

        $support = Role::firstWhere('name', 'support');

        $this->deleteJson("/api/v1/admin/roles/{$support->id}")->assertForbidden();
    }

    public function test_an_unused_custom_role_can_be_deleted(): void
    {
        $this->actingAsRole('owner');
        $role = Role::create(['name' => 'temporary', 'guard_name' => 'web']);

        $this->deleteJson("/api/v1/admin/roles/{$role->id}")->assertOk();

        $this->assertDatabaseMissing('roles', ['name' => 'temporary']);
    }
}
