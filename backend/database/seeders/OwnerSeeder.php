<?php

declare(strict_types=1);

namespace Database\Seeders;

use App\Models\CustomerGroup;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

/**
 * Creates the single store owner account and the default customer group.
 *
 * The password comes from the environment. There is no hardcoded fallback in
 * production: a seeded default admin password that nobody remembers to change
 * is how stores get taken over.
 */
class OwnerSeeder extends Seeder
{
    public function run(): void
    {
        DB::transaction(function (): void {
            CustomerGroup::firstOrCreate(
                ['slug' => 'general'],
                ['name' => 'General', 'discount_percent' => 0, 'is_default' => true, 'is_active' => true],
            );

            $email = env('OWNER_EMAIL', 'owner@upokoron.test');
            $phone = env('OWNER_PHONE', '01700000000');
            $password = env('OWNER_PASSWORD');

            if (blank($password)) {
                if (app()->environment('production')) {
                    $this->command?->error('OWNER_PASSWORD is not set. Refusing to seed an owner account.');

                    return;
                }

                $password = 'upokoron-dev-2026';
            }

            $owner = User::withTrashed()->firstWhere('email', $email);

            if ($owner === null) {
                $owner = User::create([
                    'name' => 'Store Owner',
                    'email' => $email,
                    'phone' => $phone,
                    'password' => $password,
                    'is_active' => true,
                ]);

                $owner->forceFill(['email_verified_at' => now()])->save();

                $this->command?->info("  owner created: {$email}");
            } else {
                $this->command?->info("  owner already exists: {$email}");
            }

            $owner->syncRoles(['owner']);
        });
    }
}
