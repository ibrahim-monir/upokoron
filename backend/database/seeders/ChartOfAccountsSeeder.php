<?php

declare(strict_types=1);

namespace Database\Seeders;

use App\Models\Account;
use App\Models\AccountType;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

/**
 * The default chart of accounts for a single-vendor BDT retail business.
 *
 * Accounts carrying a `system_key` are wired into posting rules and are
 * flagged is_system: they can be renamed and renumbered by the owner, but not
 * deleted or reclassified. Everything else is a starting suggestion the owner
 * is free to change.
 *
 * Idempotent, keyed on `code`.
 */
class ChartOfAccountsSeeder extends Seeder
{
    /**
     * code, name, type code, system_key, is_group, parent code
     *
     * @var array<int, array{0: string, 1: string, 2: ?string, 3: ?string, 4: bool, 5: ?string}>
     */
    private const ACCOUNTS = [
        // ─── 1000 ASSETS ────────────────────────────────────────────────
        ['1000', 'Assets', 'current_asset', null, true, null],
        ['1100', 'Current Assets', 'current_asset', null, true, '1000'],
        ['1110', 'Cash in Hand', 'current_asset', 'cash_in_hand', false, '1100'],
        ['1120', 'Bank Accounts', 'current_asset', null, true, '1100'],
        ['1121', 'Bank - Primary', 'current_asset', 'bank_default', false, '1120'],
        ['1130', 'Mobile Wallets', 'current_asset', null, true, '1100'],
        ['1131', 'bKash', 'current_asset', 'wallet_bkash', false, '1130'],
        ['1132', 'Nagad', 'current_asset', 'wallet_nagad', false, '1130'],
        ['1133', 'Rocket', 'current_asset', 'wallet_rocket', false, '1130'],
        ['1140', 'Accounts Receivable', 'current_asset', 'accounts_receivable', false, '1100'],
        // COD money sits with the courier until they remit it. Treating it as
        // cash on delivery overstates the bank balance by everything in
        // transit and hides the courier's fee entirely.
        ['1145', 'COD Receivable (Courier)', 'current_asset', 'cod_receivable', false, '1100'],
        ['1150', 'Inventory', 'current_asset', 'inventory', false, '1100'],
        // Stock that has shipped but not yet been delivered. Holding it here
        // instead of recognising revenue at dispatch is what makes a failed
        // COD delivery a one-line reversal.
        ['1155', 'Goods in Transit', 'current_asset', 'goods_in_transit', false, '1100'],
        ['1160', 'Advance to Suppliers', 'current_asset', 'supplier_advance', false, '1100'],
        ['1170', 'Prepaid Expenses', 'current_asset', 'prepaid_expenses', false, '1100'],
        ['1180', 'Payment Gateway Clearing', 'current_asset', 'gateway_clearing', false, '1100'],
        ['1200', 'Fixed Assets', 'fixed_asset', null, true, '1000'],
        ['1210', 'Equipment', 'fixed_asset', null, false, '1200'],
        ['1220', 'Furniture and Fixtures', 'fixed_asset', null, false, '1200'],
        ['1290', 'Accumulated Depreciation', 'contra_asset', 'accumulated_depreciation', false, '1200'],

        // ─── 2000 LIABILITIES ───────────────────────────────────────────
        ['2000', 'Liabilities', 'current_liability', null, true, null],
        ['2100', 'Current Liabilities', 'current_liability', null, true, '2000'],
        ['2110', 'Accounts Payable', 'current_liability', 'accounts_payable', false, '2100'],
        ['2120', 'Customer Advances', 'current_liability', 'customer_advance', false, '2100'],
        // Reward points are a debt, not a counter. Keeping them off the books
        // hides a real obligation to customers.
        ['2130', 'Reward Points Liability', 'current_liability', 'reward_liability', false, '2100'],
        ['2140', 'Affiliate Commission Payable', 'current_liability', 'affiliate_payable', false, '2100'],
        ['2150', 'Store Credit Liability', 'current_liability', 'store_credit', false, '2100'],
        ['2160', 'VAT Payable', 'current_liability', 'vat_payable', false, '2100'],
        ['2170', 'Salary Payable', 'current_liability', 'salary_payable', false, '2100'],
        ['2180', 'Refunds Payable', 'current_liability', 'refund_payable', false, '2100'],
        ['2200', 'Long Term Liabilities', 'long_term_liability', null, true, '2000'],
        ['2210', 'Bank Loan', 'long_term_liability', null, false, '2200'],

        // ─── 3000 EQUITY ────────────────────────────────────────────────
        ['3000', 'Equity', 'equity', null, true, null],
        ['3100', "Owner's Capital", 'equity', 'owner_capital', false, '3000'],
        ['3200', "Owner's Drawings", 'drawings', 'owner_drawings', false, '3000'],
        ['3300', 'Retained Earnings', 'equity', 'retained_earnings', false, '3000'],
        ['3400', 'Opening Balance Equity', 'equity', 'opening_balance_equity', false, '3000'],

        // ─── 4000 REVENUE ───────────────────────────────────────────────
        ['4000', 'Revenue', 'revenue', null, true, null],
        ['4100', 'Sales Revenue', 'revenue', 'sales_revenue', false, '4000'],
        ['4200', 'Shipping Income', 'revenue', 'shipping_income', false, '4000'],
        ['4300', 'Sales Returns', 'contra_revenue', 'sales_returns', false, '4000'],
        ['4400', 'Sales Discounts', 'contra_revenue', 'sales_discounts', false, '4000'],
        ['4500', 'Coupon Discounts', 'contra_revenue', 'coupon_discounts', false, '4000'],

        // ─── 5000 COST OF GOODS SOLD ────────────────────────────────────
        ['5000', 'Cost of Goods Sold', 'cogs', null, true, null],
        ['5100', 'Cost of Goods Sold', 'cogs', 'cogs', false, '5000'],
        ['5200', 'Inventory Shrinkage and Damage', 'cogs', 'inventory_shrinkage', false, '5000'],
        // Where the sub-paisa residue goes when an item's stock hits zero
        // with a non-zero value left over. Small, but it must go somewhere,
        // or Inventory drifts away from the stock ledger.
        ['5300', 'Inventory Adjustment (Rounding)', 'cogs', 'inventory_rounding', false, '5000'],

        // ─── 6000 OPERATING EXPENSES ────────────────────────────────────
        ['6000', 'Operating Expenses', 'operating_expense', null, true, null],
        ['6100', 'Rent', 'operating_expense', 'rent_expense', false, '6000'],
        ['6110', 'Salary and Wages', 'operating_expense', 'salary_expense', false, '6000'],
        ['6120', 'Electricity and Utilities', 'operating_expense', 'utilities_expense', false, '6000'],
        ['6130', 'Internet and Phone', 'operating_expense', null, false, '6000'],
        ['6200', 'Marketing and Advertising', 'operating_expense', 'marketing_expense', false, '6000'],
        ['6210', 'Affiliate Commission', 'operating_expense', 'affiliate_commission_expense', false, '6000'],
        ['6220', 'Reward Points Expense', 'operating_expense', 'reward_expense', false, '6000'],
        ['6300', 'Delivery and Courier', 'operating_expense', 'delivery_expense', false, '6000'],
        ['6310', 'Packaging', 'operating_expense', 'packaging_expense', false, '6000'],
        ['6400', 'Bank and Gateway Charges', 'operating_expense', 'bank_charges', false, '6000'],
        ['6500', 'Office Expenses', 'operating_expense', 'office_expense', false, '6000'],
        ['6600', 'Depreciation', 'operating_expense', 'depreciation_expense', false, '6000'],
        ['6900', 'Other Operating Expenses', 'operating_expense', 'other_expense', false, '6000'],

        // ─── 7000 OTHER INCOME ──────────────────────────────────────────
        ['7000', 'Other Income', 'other_income', null, true, null],
        ['7100', 'Interest Income', 'other_income', 'interest_income', false, '7000'],
        ['7200', 'Expired Reward Points', 'other_income', 'reward_expiry_income', false, '7000'],
        ['7900', 'Miscellaneous Income', 'other_income', 'misc_income', false, '7000'],
    ];

    public function run(): void
    {
        $types = AccountType::pluck('id', 'code');

        if ($types->isEmpty()) {
            $this->call(AccountTypeSeeder::class);
            $types = AccountType::pluck('id', 'code');
        }

        DB::transaction(function () use ($types): void {
            $ids = [];

            foreach (self::ACCOUNTS as [$code, $name, $typeCode, $systemKey, $isGroup, $parentCode]) {
                $account = Account::updateOrCreate(
                    ['code' => $code],
                    [
                        'name' => $name,
                        'account_type_id' => $types[$typeCode],
                        'parent_id' => $parentCode === null ? null : ($ids[$parentCode] ?? null),
                        'is_group' => $isGroup,
                        'system_key' => $systemKey,
                        'is_system' => $systemKey !== null,
                        'is_active' => true,
                    ],
                );

                $ids[$code] = $account->id;
            }
        });

        $this->command?->info('  accounts: '.count(self::ACCOUNTS).' ('.
            count(array_filter(self::ACCOUNTS, fn ($a) => $a[3] !== null)).' system-mapped)');
    }
}
