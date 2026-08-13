<?php

declare(strict_types=1);

namespace Tests\Feature\Admin;

use App\Services\Support\SettingsService;
use Database\Seeders\SettingsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class SettingsTest extends TestCase
{
    use RefreshDatabase;

    public function test_an_unset_key_falls_back_to_its_config_default(): void
    {
        $settings = app(SettingsService::class);

        $this->assertDatabaseCount('settings', 0);
        $this->assertSame('delivered', $settings->get('revenue_recognition_point'));
        $this->assertSame(30, $settings->int('reservation_ttl_minutes'));
    }

    public function test_a_saved_value_overrides_the_config_default(): void
    {
        $settings = app(SettingsService::class);

        $settings->set('reservation_ttl_minutes', 45);

        $this->assertSame(45, app(SettingsService::class)->int('reservation_ttl_minutes'));
        $this->assertDatabaseHas('settings', ['key' => 'reservation_ttl_minutes', 'value' => '45']);
    }

    public function test_decimal_settings_stay_strings(): void
    {
        $settings = app(SettingsService::class);
        $settings->set('redemption_rate', '0.75');

        $value = app(SettingsService::class)->decimal('redemption_rate');

        // Money must never round-trip through a float.
        $this->assertIsString($value);
        $this->assertSame('0.75', $value);
    }

    public function test_boolean_settings_cast_correctly(): void
    {
        $settings = app(SettingsService::class);
        $settings->set('allow_guest_checkout', false);

        $this->assertFalse(app(SettingsService::class)->bool('allow_guest_checkout'));
    }

    public function test_an_owner_can_update_settings(): void
    {
        $this->seed(SettingsSeeder::class);
        $this->actingAsRole('owner');

        $this->putJson('/api/v1/admin/settings', [
            'settings' => ['store_name' => 'Upokoron Shop', 'return_window_days' => 14],
        ])->assertOk();

        $this->assertSame('Upokoron Shop', app(SettingsService::class)->get('store_name'));
        $this->assertSame(14, app(SettingsService::class)->int('return_window_days'));
    }

    public function test_unknown_setting_keys_are_rejected(): void
    {
        $this->actingAsRole('owner');

        $this->putJson('/api/v1/admin/settings', [
            'settings' => ['definitely_not_a_setting' => 'x'],
        ])->assertStatus(422);

        $this->assertDatabaseMissing('settings', ['key' => 'definitely_not_a_setting']);
    }

    public function test_a_support_user_cannot_change_settings(): void
    {
        $this->actingAsRole('support');

        $this->putJson('/api/v1/admin/settings', [
            'settings' => ['store_name' => 'Hijacked'],
        ])->assertForbidden();
    }

    public function test_public_settings_are_readable_without_authentication(): void
    {
        $this->seed(SettingsSeeder::class);

        $this->getJson('/api/v1/shop/settings')
            ->assertOk()
            ->assertJsonPath('data.currency_code', 'BDT')
            ->assertJsonPath('data.store_name', config('upokoron.settings.store.store_name'));
    }

    public function test_public_settings_do_not_leak_business_configuration(): void
    {
        $this->seed(SettingsSeeder::class);

        $data = $this->getJson('/api/v1/shop/settings')->json('data');

        // Commission rates and cost controls are nobody else's business.
        $this->assertArrayNotHasKey('default_commission_rate', $data);
        $this->assertArrayNotHasKey('allow_negative_stock', $data);
    }

    /**
     * The storefront footer and content pages render before anyone signs in,
     * so their settings have to be readable without a session.
     */
    public function test_footer_and_page_settings_are_public(): void
    {
        $this->seed(SettingsSeeder::class);

        $data = $this->getJson('/api/v1/shop/settings')->assertOk()->json('data');

        foreach (['store_phone', 'store_address', 'store_facebook', 'page_about', 'page_privacy'] as $key) {
            $this->assertArrayHasKey($key, $data, "[{$key}] must be readable by the storefront.");
        }
    }
}
