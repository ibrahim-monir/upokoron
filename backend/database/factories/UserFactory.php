<?php

declare(strict_types=1);

namespace Database\Factories;

use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

/**
 * @extends Factory<User>
 */
class UserFactory extends Factory
{
    protected static ?string $password;

    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        /*
         * Every nullable column is listed explicitly, even as null.
         *
         * A factory-built model only holds the attributes the factory set, so
         * anything omitted here is *missing* rather than null -- and under the
         * strict-model settings this project runs in dev and test, reading it
         * throws MissingAttributeException. Listing them keeps a factory model
         * indistinguishable from one loaded out of the database.
         */
        return [
            'name' => fake()->name(),
            'email' => fake()->unique()->safeEmail(),
            'phone' => $this->bangladeshiPhone(),
            'email_verified_at' => now(),
            'phone_verified_at' => null,
            'password' => static::$password ??= Hash::make('password'),
            'avatar' => null,
            'is_active' => true,
            'last_login_at' => null,
            'last_login_ip' => null,
            'remember_token' => Str::random(10),
        ];
    }

    public function unverified(): static
    {
        return $this->state(fn (array $attributes) => ['email_verified_at' => null]);
    }

    public function inactive(): static
    {
        return $this->state(fn (array $attributes) => ['is_active' => false]);
    }

    /**
     * Give the user a role. Roles must already exist -- tests seed them via
     * RolePermissionSeeder in TestCase::setUp().
     */
    public function role(string $role): static
    {
        return $this->afterCreating(fn (User $user) => $user->assignRole($role));
    }

    /**
     * Valid BD mobile number, matching the regex the request layer enforces.
     */
    private function bangladeshiPhone(): string
    {
        return '01'.fake()->numberBetween(3, 9).fake()->numerify('########');
    }
}
