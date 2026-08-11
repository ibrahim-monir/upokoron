<?php

declare(strict_types=1);

namespace Tests\Feature\Auth;

use App\Models\Customer;
use App\Models\CustomerGroup;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class RegistrationTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        CustomerGroup::create([
            'name' => 'General', 'slug' => 'general',
            'discount_percent' => 0, 'is_default' => true, 'is_active' => true,
        ]);
    }

    public function test_a_customer_can_register_with_a_phone_number(): void
    {
        $response = $this->postJson('/api/v1/shop/auth/register', [
            'name' => 'Rahim Uddin',
            'phone' => '01712345678',
            'password' => 'secret-pass-1',
            'password_confirmation' => 'secret-pass-1',
            'device_name' => 'test',
        ]);

        $response->assertCreated()
            ->assertJsonStructure(['user' => ['id', 'name', 'phone', 'roles'], 'token']);

        $user = User::firstWhere('phone', '01712345678');

        $this->assertNotNull($user);
        $this->assertTrue($user->hasRole('customer'));
        $this->assertDatabaseHas('customers', ['user_id' => $user->id, 'name' => 'Rahim Uddin']);
    }

    public function test_registration_creates_a_customer_profile_with_a_sequential_code(): void
    {
        foreach (['01712345678', '01812345678'] as $phone) {
            $this->postJson('/api/v1/shop/auth/register', [
                'name' => 'Customer '.$phone,
                'phone' => $phone,
                'password' => 'secret-pass-1',
                'password_confirmation' => 'secret-pass-1',
                'device_name' => 'test',
            ])->assertCreated();
        }

        $codes = Customer::orderBy('id')->pluck('code')->all();

        $this->assertSame(['CUS-000001', 'CUS-000002'], $codes);
    }

    public function test_registration_requires_either_a_phone_or_an_email(): void
    {
        $this->postJson('/api/v1/shop/auth/register', [
            'name' => 'No Contact',
            'password' => 'secret-pass-1',
            'password_confirmation' => 'secret-pass-1',
        ])->assertStatus(422)->assertJsonValidationErrors('phone');
    }

    public function test_registration_rejects_a_malformed_bangladeshi_number(): void
    {
        $this->postJson('/api/v1/shop/auth/register', [
            'name' => 'Bad Number',
            'phone' => '01212345678',
            'password' => 'secret-pass-1',
            'password_confirmation' => 'secret-pass-1',
        ])->assertStatus(422)->assertJsonValidationErrors('phone');
    }

    public function test_registration_rejects_a_duplicate_phone(): void
    {
        User::factory()->create(['phone' => '01712345678']);

        $this->postJson('/api/v1/shop/auth/register', [
            'name' => 'Duplicate',
            'phone' => '01712345678',
            'password' => 'secret-pass-1',
            'password_confirmation' => 'secret-pass-1',
        ])->assertStatus(422)->assertJsonValidationErrors('phone');
    }

    public function test_a_new_account_cannot_reach_the_admin_panel(): void
    {
        $response = $this->postJson('/api/v1/shop/auth/register', [
            'name' => 'Rahim Uddin',
            'phone' => '01712345678',
            'password' => 'secret-pass-1',
            'password_confirmation' => 'secret-pass-1',
            'device_name' => 'test',
        ])->assertCreated();

        $token = $response->json('token');

        $this->withHeader('Authorization', "Bearer {$token}")
            ->getJson('/api/v1/admin/users')
            ->assertForbidden();
    }
}
