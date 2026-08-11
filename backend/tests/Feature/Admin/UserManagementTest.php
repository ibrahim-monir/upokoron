<?php

declare(strict_types=1);

namespace Tests\Feature\Admin;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class UserManagementTest extends TestCase
{
    use RefreshDatabase;

    public function test_an_owner_can_list_users(): void
    {
        $this->actingAsRole('owner');
        User::factory()->count(3)->create();

        $this->getJson('/api/v1/admin/users')
            ->assertOk()
            ->assertJsonCount(4, 'data');
    }

    public function test_a_support_user_cannot_list_users(): void
    {
        $this->actingAsRole('support');

        $this->getJson('/api/v1/admin/users')->assertForbidden();
    }

    public function test_an_owner_can_create_a_staff_user(): void
    {
        $this->actingAsRole('owner');

        $this->postJson('/api/v1/admin/users', [
            'name' => 'New Manager',
            'email' => 'manager@example.com',
            'password' => 'secret-pass-1',
            'password_confirmation' => 'secret-pass-1',
            'roles' => ['manager'],
        ])->assertCreated();

        $user = User::firstWhere('email', 'manager@example.com');

        $this->assertTrue($user->hasRole('manager'));
        $this->assertTrue($user->can('admin.access'));
    }

    /**
     * The escalation guard. A manager holds users.manage, so without this
     * rule they could mint an owner account and take over the store.
     */
    public function test_a_manager_cannot_create_a_user_more_powerful_than_themselves(): void
    {
        $this->actingAsRole('manager');

        $this->postJson('/api/v1/admin/users', [
            'name' => 'Sneaky Owner',
            'email' => 'sneaky@example.com',
            'password' => 'secret-pass-1',
            'password_confirmation' => 'secret-pass-1',
            'roles' => ['owner'],
        ])->assertForbidden();

        $this->assertDatabaseMissing('users', ['email' => 'sneaky@example.com']);
    }

    public function test_a_manager_can_create_a_user_at_or_below_their_own_level(): void
    {
        $this->actingAsRole('manager');

        $this->postJson('/api/v1/admin/users', [
            'name' => 'New Support',
            'email' => 'support@example.com',
            'password' => 'secret-pass-1',
            'password_confirmation' => 'secret-pass-1',
            'roles' => ['support'],
        ])->assertCreated();
    }

    public function test_a_manager_cannot_promote_an_existing_user_to_owner(): void
    {
        $this->actingAsRole('manager');
        $target = User::factory()->role('support')->create();

        $this->putJson("/api/v1/admin/users/{$target->id}", [
            'name' => $target->name,
            'email' => $target->email,
            'roles' => ['owner'],
        ])->assertForbidden();

        $this->assertFalse($target->fresh()->hasRole('owner'));
    }

    public function test_a_manager_cannot_edit_an_owner(): void
    {
        $this->actingAsRole('manager');
        $owner = User::factory()->role('owner')->create();

        $this->putJson("/api/v1/admin/users/{$owner->id}", [
            'name' => 'Renamed Owner',
            'email' => $owner->email,
        ])->assertForbidden();
    }

    public function test_a_user_cannot_delete_their_own_account(): void
    {
        $actor = $this->actingAsRole('owner');

        $this->deleteJson("/api/v1/admin/users/{$actor->id}")->assertForbidden();

        $this->assertNotSoftDeleted('users', ['id' => $actor->id]);
    }

    public function test_the_last_owner_cannot_be_deleted(): void
    {
        $owner = $this->actingAsRole('owner');
        $other = User::factory()->role('owner')->create();

        // Two owners exist, so removing one is allowed.
        $this->deleteJson("/api/v1/admin/users/{$other->id}")->assertOk();

        // Only this owner is left; they cannot remove themselves either.
        $this->deleteJson("/api/v1/admin/users/{$owner->id}")->assertForbidden();

        $this->assertSame(1, User::role('owner')->count());
    }

    public function test_deleting_a_user_revokes_their_tokens(): void
    {
        $this->actingAsRole('owner');

        $target = User::factory()->role('support')->create();
        $target->createToken('phone');

        $this->assertSame(1, $target->tokens()->count());

        $this->deleteJson("/api/v1/admin/users/{$target->id}")->assertOk();

        $this->assertSame(0, $target->tokens()->count());
        $this->assertSoftDeleted('users', ['id' => $target->id]);
    }

    public function test_an_owner_can_restore_a_deleted_user(): void
    {
        $this->actingAsRole('owner');
        $target = User::factory()->role('support')->create();
        $target->delete();

        $this->postJson("/api/v1/admin/users/{$target->id}/restore")->assertOk();

        $this->assertNotSoftDeleted('users', ['id' => $target->id]);
    }

    public function test_unauthenticated_requests_are_rejected(): void
    {
        $this->getJson('/api/v1/admin/users')
            ->assertUnauthorized()
            ->assertJsonPath('code', 'unauthenticated');
    }
}
