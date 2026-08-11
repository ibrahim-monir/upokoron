<?php

declare(strict_types=1);

namespace Database\Seeders;

use App\Enums\AccountCategory;
use App\Enums\NormalBalance;
use App\Models\AccountType;
use Illuminate\Database\Seeder;

class AccountTypeSeeder extends Seeder
{
    public function run(): void
    {
        $types = [
            ['current_asset', 'Current Asset', AccountCategory::Asset, NormalBalance::Debit, 10],
            ['fixed_asset', 'Fixed Asset', AccountCategory::Asset, NormalBalance::Debit, 20],
            // Accumulated depreciation sits under Assets but carries a credit
            // balance, which is why normal_balance lives on the type rather
            // than being derived from the category.
            ['contra_asset', 'Contra Asset', AccountCategory::Asset, NormalBalance::Credit, 30],

            ['current_liability', 'Current Liability', AccountCategory::Liability, NormalBalance::Credit, 40],
            ['long_term_liability', 'Long Term Liability', AccountCategory::Liability, NormalBalance::Credit, 50],

            ['equity', 'Equity', AccountCategory::Equity, NormalBalance::Credit, 60],
            ['drawings', 'Drawings', AccountCategory::Equity, NormalBalance::Debit, 65],

            ['revenue', 'Revenue', AccountCategory::Revenue, NormalBalance::Credit, 70],
            // Sales returns and discounts: revenue accounts that reduce
            // revenue, so they are debit-normal.
            ['contra_revenue', 'Contra Revenue', AccountCategory::Revenue, NormalBalance::Debit, 75],

            ['cogs', 'Cost of Goods Sold', AccountCategory::Cogs, NormalBalance::Debit, 80],

            ['operating_expense', 'Operating Expense', AccountCategory::Expense, NormalBalance::Debit, 90],
            ['other_income', 'Other Income', AccountCategory::Revenue, NormalBalance::Credit, 95],
            ['other_expense', 'Other Expense', AccountCategory::Expense, NormalBalance::Debit, 100],
        ];

        foreach ($types as [$code, $name, $category, $normal, $position]) {
            AccountType::updateOrCreate(
                ['code' => $code],
                [
                    'name' => $name,
                    'category' => $category,
                    'normal_balance' => $normal,
                    'position' => $position,
                ],
            );
        }

        $this->command?->info('  account types: '.count($types));
    }
}
