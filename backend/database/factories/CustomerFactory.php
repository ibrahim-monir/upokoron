<?php

declare(strict_types=1);

namespace Database\Factories;

use App\Models\Customer;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Customer>
 */
class CustomerFactory extends Factory
{
    protected $model = Customer::class;

    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            // Unique per row without a counter: two customers created in the
            // same test must not collide on the unique index.
            'code' => 'CUS-'.fake()->unique()->numerify('######'),
            'name' => fake()->name(),
            'phone' => '01'.fake()->numberBetween(3, 9).fake()->numerify('########'),
            'email' => fake()->unique()->safeEmail(),
            'is_blocked' => false,
        ];
    }

    public function blocked(): static
    {
        return $this->state(fn (): array => ['is_blocked' => true]);
    }
}
