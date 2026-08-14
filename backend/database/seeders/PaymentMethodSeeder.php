<?php

declare(strict_types=1);

namespace Database\Seeders;

use App\Enums\PaymentMethodType;
use App\Models\Account;
use App\Models\PaymentMethod;
use Illuminate\Database\Seeder;

/**
 * How a Bangladeshi shop actually gets paid.
 *
 * Cash on delivery first, because that is how most of it arrives, and the
 * accounting is built around it: money owed by the courier until they settle.
 *
 * Idempotent -- safe to re-run on a live database after a deploy.
 */
class PaymentMethodSeeder extends Seeder
{
    public function run(): void
    {
        $methods = [
            [
                'code' => 'cod',
                'name' => 'Cash on delivery',
                'type' => PaymentMethodType::CashOnDelivery,
                // Where the money ends up, not what it settles. The courier
                // hands over cash; the COD Receivable balance is what that
                // cash clears, and naming it here would post an entry that
                // balances while moving nothing.
                'account_key' => 'cash_in_hand',
                'instructions' => 'Pay the courier when your order arrives. Check the product before paying.',
                // A cap, because COD puts real cash in a courier's bag and
                // the shop carries the loss if it goes missing. The owner can
                // raise or remove it.
                'max_order_total' => '25000.00',
                'position' => 1,
            ],
            [
                'code' => 'bkash',
                'name' => 'bKash',
                'type' => PaymentMethodType::Manual,
                'account_key' => 'wallet_bkash',
                'instructions' => 'Send the total to the shop bKash number, then enter the transaction ID below. Your order is confirmed once we verify it.',
                'position' => 2,
            ],
            [
                'code' => 'nagad',
                'name' => 'Nagad',
                'type' => PaymentMethodType::Manual,
                'account_key' => 'wallet_nagad',
                'instructions' => 'Send the total to the shop Nagad number, then enter the transaction ID below.',
                'position' => 3,
            ],
            [
                'code' => 'bank',
                'name' => 'Bank transfer',
                'type' => PaymentMethodType::Manual,
                'account_key' => 'bank_default',
                'instructions' => 'Transfer to the shop bank account and enter the reference below.',
                'position' => 4,
            ],
            [
                'code' => 'cash',
                'name' => 'Cash',
                'type' => PaymentMethodType::Cash,
                'account_key' => 'cash_in_hand',
                'instructions' => null,
                // Not offered on the storefront: this is for orders taken at
                // the counter or over the phone and keyed in by staff.
                'is_active' => false,
                'position' => 5,
            ],
        ];

        foreach ($methods as $definition) {
            $account = Account::where('system_key', $definition['account_key'])->first();

            PaymentMethod::updateOrCreate(
                ['code' => $definition['code']],
                [
                    'name' => $definition['name'],
                    'type' => $definition['type'],
                    'instructions' => $definition['instructions'],
                    'account_id' => $account?->id,
                    'extra_charge' => '0.00',
                    'max_order_total' => $definition['max_order_total'] ?? null,
                    'is_active' => $definition['is_active'] ?? true,
                    'position' => $definition['position'],
                ],
            );
        }

        $this->command?->info('payment methods: '.PaymentMethod::count());
    }
}
