<?php

declare(strict_types=1);

namespace Tests\Feature\Auth;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\RateLimiter;
use Tests\TestCase;

class LoginTest extends TestCase
{
    use RefreshDatabase;

    public function test_a_customer_can_sign_in_with_a_phone_number(): void
    {
        $user = User::factory()->role('customer')->create([
            'phone' => '01712345678',
            'password' => Hash::make('secret-pass-1'),
        ]);

        $this->postJson('/api/v1/shop/auth/login', [
            'identifier' => '01712345678',
            'password' => 'secret-pass-1',
            'device_name' => 'test',
        ])->assertOk()->assertJsonPath('user.id', $user->id);
    }

    public function test_a_customer_can_sign_in_with_an_email(): void
    {
        User::factory()->role('customer')->create([
            'email' => 'rahim@example.com',
            'password' => Hash::make('secret-pass-1'),
        ]);

        $this->postJson('/api/v1/shop/auth/login', [
            'identifier' => 'rahim@example.com',
            'password' => 'secret-pass-1',
            'device_name' => 'test',
        ])->assertOk();
    }

    public function test_wrong_credentials_are_rejected(): void
    {
        User::factory()->create(['phone' => '01712345678', 'password' => Hash::make('secret-pass-1')]);

        $this->postJson('/api/v1/shop/auth/login', [
            'identifier' => '01712345678',
            'password' => 'wrong-password',
        ])->assertStatus(422)->assertJsonValidationErrors('identifier');
    }

    public function test_an_unknown_account_returns_the_same_error_as_a_wrong_password(): void
    {
        User::factory()->create(['phone' => '01712345678', 'password' => Hash::make('secret-pass-1')]);

        $known = $this->postJson('/api/v1/shop/auth/login', [
            'identifier' => '01712345678',
            'password' => 'wrong-password',
        ]);

        $unknown = $this->postJson('/api/v1/shop/auth/login', [
            'identifier' => '01999999999',
            'password' => 'wrong-password',
        ]);

        // Identical messages, so this endpoint cannot enumerate customers.
        $this->assertSame(
            $known->json('errors.identifier'),
            $unknown->json('errors.identifier'),
        );
    }

    public function test_a_deactivated_account_cannot_sign_in(): void
    {
        User::factory()->inactive()->create([
            'phone' => '01712345678',
            'password' => Hash::make('secret-pass-1'),
        ]);

        $this->postJson('/api/v1/shop/auth/login', [
            'identifier' => '01712345678',
            'password' => 'secret-pass-1',
        ])->assertStatus(422)->assertJsonValidationErrors('identifier');
    }

    public function test_login_is_throttled_after_five_failed_attempts(): void
    {
        User::factory()->create(['phone' => '01712345678', 'password' => Hash::make('secret-pass-1')]);

        for ($i = 0; $i < 5; $i++) {
            $this->postJson('/api/v1/shop/auth/login', [
                'identifier' => '01712345678',
                'password' => 'wrong-password',
            ])->assertStatus(422);
        }

        // The sixth attempt is refused even with the CORRECT password, which
        // is what makes this a real lockout rather than a slow-down.
        $this->postJson('/api/v1/shop/auth/login', [
            'identifier' => '01712345678',
            'password' => 'secret-pass-1',
        ])->assertStatus(422)->assertJsonValidationErrors('identifier');

        RateLimiter::clear('01712345678|127.0.0.1');
    }

    public function test_admin_login_rejects_an_account_without_admin_access(): void
    {
        User::factory()->role('customer')->create([
            'email' => 'customer@example.com',
            'password' => Hash::make('secret-pass-1'),
        ]);

        $this->postJson('/api/v1/admin/auth/login', [
            'identifier' => 'customer@example.com',
            'password' => 'secret-pass-1',
        ])->assertStatus(422)->assertJsonValidationErrors('identifier');
    }

    public function test_admin_login_accepts_a_staff_account(): void
    {
        User::factory()->role('manager')->create([
            'email' => 'manager@example.com',
            'password' => Hash::make('secret-pass-1'),
        ]);

        $this->postJson('/api/v1/admin/auth/login', [
            'identifier' => 'manager@example.com',
            'password' => 'secret-pass-1',
            'device_name' => 'test',
        ])->assertOk()->assertJsonStructure(['user', 'token']);
    }

    public function test_a_storefront_token_does_not_carry_wildcard_abilities(): void
    {
        $user = User::factory()->role('customer')->create([
            'phone' => '01712345678',
            'password' => Hash::make('secret-pass-1'),
        ]);

        $this->postJson('/api/v1/shop/auth/login', [
            'identifier' => '01712345678',
            'password' => 'secret-pass-1',
            'device_name' => 'mobile',
        ])->assertOk();

        $abilities = $user->tokens()->first()->abilities;

        $this->assertSame(['storefront'], $abilities);
        $this->assertNotContains('*', $abilities);
    }

    public function test_a_signed_in_user_can_fetch_their_own_profile(): void
    {
        $user = User::factory()->role('customer')->create();

        $this->actingAs($user)
            ->getJson('/api/v1/shop/auth/me')
            ->assertOk()
            ->assertJsonPath('data.id', $user->id);
    }

    /**
     * Gender lives on the customer record, not the login, and the account
     * screen is the only place it is ever set. It was accepted nowhere
     * before this -- the column existed and the endpoint dropped it.
     */
    public function test_a_customer_can_set_their_gender_from_the_account_page(): void
    {
        $user = User::factory()->role('customer')->create(['phone' => '01712345678']);
        \App\Models\Customer::factory()->create([
            'user_id' => $user->id,
            'name' => $user->name,
            'phone' => $user->phone,
        ]);

        $this->actingAs($user)
            ->putJson('/api/v1/shop/auth/profile', [
                'name' => 'Bessie Cooper',
                'phone' => '01712345678',
                'gender' => 'female',
            ])
            ->assertOk()
            ->assertJsonPath('user.customer.gender', 'female');

        $this->assertSame('Bessie Cooper', $user->fresh()->name);
        $this->assertSame('female', $user->fresh()->customer->gender);
    }

    public function test_the_profile_endpoint_refuses_a_gender_it_does_not_know(): void
    {
        $user = User::factory()->role('customer')->create(['phone' => '01712345678']);

        $this->actingAs($user)
            ->putJson('/api/v1/shop/auth/profile', [
                'name' => 'Bessie Cooper',
                'phone' => '01712345678',
                'gender' => 'yes',
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors('gender');
    }

    public function test_an_account_deactivated_mid_session_is_locked_out_immediately(): void
    {
        $user = User::factory()->role('customer')->create();

        $this->actingAs($user)->getJson('/api/v1/shop/auth/me')->assertOk();

        $user->update(['is_active' => false]);

        $this->actingAs($user->fresh())
            ->getJson('/api/v1/shop/auth/me')
            ->assertForbidden()
            ->assertJsonPath('code', 'account_inactive');
    }
}
