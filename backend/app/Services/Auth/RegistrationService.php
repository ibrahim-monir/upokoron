<?php

declare(strict_types=1);

namespace App\Services\Auth;

use App\Models\Customer;
use App\Models\CustomerGroup;
use App\Models\User;
use App\Services\Support\DocumentNumberService;
use Illuminate\Support\Facades\DB;

/**
 * Creating a storefront account is three writes that must succeed or fail
 * together: the user, the customer profile, and the customer role. Doing it
 * outside a transaction is how you end up with users who can log in but have
 * no customer record and crash checkout.
 */
class RegistrationService
{
    public function __construct(private readonly DocumentNumberService $numbers) {}

    /**
     * @param  array{name: string, email?: string|null, phone?: string|null, password: string}  $data
     */
    public function registerCustomer(array $data): User
    {
        return DB::transaction(function () use ($data): User {
            $user = User::create([
                'name' => $data['name'],
                'email' => $data['email'] ?? null,
                'phone' => $data['phone'] ?? null,
                'password' => $data['password'],
                'is_active' => true,
            ]);

            $user->assignRole('customer');

            Customer::create([
                'user_id' => $user->id,
                'customer_group_id' => CustomerGroup::where('is_default', true)->value('id'),
                'code' => $this->numbers->next('customer'),
                'name' => $data['name'],
                'phone' => $data['phone'] ?? null,
                'email' => $data['email'] ?? null,
            ]);

            return $user->load('customer', 'roles');
        });
    }
}
