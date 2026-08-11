<?php

declare(strict_types=1);

namespace Tests\Feature\Support;

use App\Enums\AuditEvent;
use App\Models\AuditLog;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class AuditLogTest extends TestCase
{
    use RefreshDatabase;

    public function test_creating_an_audited_model_writes_a_log_row(): void
    {
        $user = User::factory()->create(['name' => 'Rahim']);

        $log = AuditLog::forModel(User::class, $user->id)->event(AuditEvent::Created)->first();

        $this->assertNotNull($log);
        $this->assertSame('Rahim', $log->new_values['name']);
    }

    public function test_a_password_is_never_written_to_the_audit_trail(): void
    {
        $user = User::factory()->create(['password' => Hash::make('secret-pass-1')]);

        $logs = AuditLog::forModel(User::class, $user->id)->get();

        $this->assertNotEmpty($logs);

        foreach ($logs as $log) {
            $this->assertArrayNotHasKey('password', $log->new_values ?? []);
            $this->assertArrayNotHasKey('password', $log->old_values ?? []);
            $this->assertArrayNotHasKey('remember_token', $log->new_values ?? []);
        }
    }

    public function test_an_update_records_only_what_changed(): void
    {
        $user = User::factory()->create(['name' => 'Rahim']);
        $user->update(['name' => 'Rahim Uddin']);

        $log = AuditLog::forModel(User::class, $user->id)->event(AuditEvent::Updated)->first();

        $this->assertSame(['name' => 'Rahim'], $log->old_values);
        $this->assertSame(['name' => 'Rahim Uddin'], $log->new_values);
    }

    public function test_an_update_that_changes_nothing_meaningful_writes_no_row(): void
    {
        $user = User::factory()->create();

        $before = AuditLog::forModel(User::class, $user->id)->count();

        // touch() bumps updated_at only, which is on the exclude list.
        $user->touch();

        $this->assertSame($before, AuditLog::forModel(User::class, $user->id)->count());
    }

    public function test_the_acting_user_is_recorded(): void
    {
        $actor = $this->actingAsRole('owner');

        $target = User::factory()->create();

        $log = AuditLog::forModel(User::class, $target->id)->event(AuditEvent::Created)->first();

        $this->assertSame($actor->id, $log->user_id);
    }

    public function test_a_successful_login_is_logged_against_the_user_who_signed_in(): void
    {
        $user = User::factory()->role('customer')->create([
            'phone' => '01712345678',
            'password' => Hash::make('secret-pass-1'),
        ]);

        $this->postJson('/api/v1/shop/auth/login', [
            'identifier' => '01712345678',
            'password' => 'secret-pass-1',
            'device_name' => 'test',
        ])->assertOk();

        $log = AuditLog::where('event', AuditEvent::Login->value)->sole();

        // Token auth does not populate the guard by itself, so without an
        // explicit setUser this row would be attributed to nobody.
        $this->assertSame($user->id, $log->user_id);
    }

    public function test_a_failed_login_against_a_real_account_is_logged(): void
    {
        User::factory()->create([
            'phone' => '01712345678',
            'password' => Hash::make('secret-pass-1'),
        ]);

        $this->postJson('/api/v1/shop/auth/login', [
            'identifier' => '01712345678',
            'password' => 'wrong-password',
        ])->assertStatus(422);

        $this->assertSame(1, AuditLog::where('event', AuditEvent::LoginFailed->value)->count());
    }

    public function test_an_accountant_can_read_the_audit_trail(): void
    {
        $this->actingAsRole('accountant');
        User::factory()->create();

        $this->getJson('/api/v1/admin/audit-logs')
            ->assertOk()
            ->assertJsonStructure(['data' => [['id', 'event', 'auditable_type', 'created_at']]]);
    }

    public function test_a_support_user_cannot_read_the_audit_trail(): void
    {
        $this->actingAsRole('support');

        $this->getJson('/api/v1/admin/audit-logs')->assertForbidden();
    }

    public function test_audit_logs_can_be_filtered_by_event(): void
    {
        $this->actingAsRole('owner');

        $user = User::factory()->create();
        $user->update(['name' => 'Changed']);

        $response = $this->getJson('/api/v1/admin/audit-logs?event=updated')->assertOk();

        foreach ($response->json('data') as $row) {
            $this->assertSame('updated', $row['event']);
        }
    }
}
