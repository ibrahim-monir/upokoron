<?php

declare(strict_types=1);

namespace App\Support;

/**
 * The single source of truth for every permission in the system.
 *
 * The whole set is declared up front, including permissions for modules that
 * arrive in later phases, so that roles are designed once rather than being
 * patched every time a feature lands. RolePermissionSeeder is idempotent and
 * syncs the database to whatever is listed here.
 */
final class Permissions
{
    /**
     * Gate for the admin panel itself. Every admin route requires it on top
     * of its own specific permission.
     */
    public const ADMIN_ACCESS = 'admin.access';

    /**
     * @return array<string, array<string, string>> group => [permission => label]
     */
    public static function all(): array
    {
        return [
            'General' => [
                self::ADMIN_ACCESS => 'Access admin panel',
                'dashboard.view' => 'View dashboard',
            ],
            'Catalog' => [
                'products.view' => 'View products',
                'products.create' => 'Create products',
                'products.update' => 'Edit products',
                'products.delete' => 'Delete products',
                'categories.manage' => 'Manage categories',
                'brands.manage' => 'Manage brands',
                'attributes.manage' => 'Manage attributes',
                'media.view' => 'View the image library',
                'media.manage' => 'Upload and delete images',
            ],
            'Inventory' => [
                'inventory.view' => 'View stock levels',
                'inventory.adjust' => 'Adjust stock',
                'inventory.opening' => 'Enter opening stock',
                'inventory.valuation' => 'View inventory valuation',
            ],
            'Purchasing' => [
                'suppliers.view' => 'View suppliers',
                'suppliers.manage' => 'Manage suppliers',
                'purchases.view' => 'View purchases',
                'purchases.create' => 'Create purchases',
                'purchases.update' => 'Edit purchases',
                'purchases.receive' => 'Receive purchases into stock',
                'purchases.return' => 'Return goods to supplier',
                'purchases.pay' => 'Pay suppliers',
                'purchases.cancel' => 'Cancel purchases',
            ],
            'Sales' => [
                'orders.view' => 'View orders',
                'orders.create' => 'Create orders manually',
                'orders.update' => 'Edit orders',
                'orders.status' => 'Change order status',
                'orders.cancel' => 'Cancel orders',
                'orders.payment' => 'Record order payments',
                'returns.view' => 'View returns',
                'returns.manage' => 'Approve and receive returns',
                'returns.refund' => 'Issue refunds',
            ],
            'Customers' => [
                'customers.view' => 'View customers',
                'customers.manage' => 'Manage customers',
                'customers.ledger' => 'View customer ledger',
            ],
            'Marketing' => [
                'banners.manage' => 'Manage home page banners',
                'coupons.manage' => 'Manage coupons',
                'discounts.manage' => 'Manage discount campaigns',
                'rewards.view' => 'View reward points',
                'rewards.adjust' => 'Adjust reward points',
                'affiliate.view' => 'View affiliates',
                'affiliate.manage' => 'Manage affiliates',
                'affiliate.payout' => 'Pay affiliate commissions',
            ],
            'Money' => [
                'expenses.view' => 'View expenses',
                'expenses.manage' => 'Record expenses',
                'incomes.view' => 'View other income',
                'incomes.manage' => 'Record other income',
                'accounting.view' => 'View ledgers and journals',
                'accounting.post' => 'Post manual journal entries',
                'accounting.reverse' => 'Reverse journal entries',
                'accounting.close_period' => 'Close accounting periods',
                'accounts.manage' => 'Manage chart of accounts',
            ],
            'Reports' => [
                'reports.sales' => 'Sales and product reports',
                'reports.inventory' => 'Inventory reports',
                'reports.financial' => 'Financial statements and profit reports',
            ],
            'Configuration' => [
                'shipping.manage' => 'Manage shipping methods and zones',
                'payments.manage' => 'Manage payment methods',
                'settings.manage' => 'Manage store settings',
                'users.view' => 'View users',
                'users.manage' => 'Manage users',
                'roles.manage' => 'Manage roles and permissions',
                'audit.view' => 'View audit logs',
            ],
        ];
    }

    /**
     * @return array<int, string>
     */
    public static function names(): array
    {
        $names = [];

        foreach (self::all() as $permissions) {
            $names = array_merge($names, array_keys($permissions));
        }

        return $names;
    }

    /**
     * Role definitions. `*` means every permission.
     *
     * The split is deliberate: Support can move an order along but cannot
     * touch money, and Accountant can read the whole business but cannot
     * change a product price. Only Owner can manage users and reverse ledger
     * entries.
     *
     * @return array<string, array<int, string>|string>
     */
    public static function roles(): array
    {
        return [
            'owner' => '*',

            'manager' => [
                self::ADMIN_ACCESS, 'dashboard.view',
                'products.view', 'products.create', 'products.update', 'products.delete',
                'categories.manage', 'brands.manage', 'attributes.manage',
                'media.view', 'media.manage',
                'inventory.view', 'inventory.adjust', 'inventory.valuation',
                'suppliers.view', 'suppliers.manage',
                'purchases.view', 'purchases.create', 'purchases.update',
                'purchases.receive', 'purchases.return', 'purchases.cancel',
                'orders.view', 'orders.create', 'orders.update', 'orders.status',
                'orders.cancel', 'orders.payment',
                'returns.view', 'returns.manage', 'returns.refund',
                'customers.view', 'customers.manage', 'customers.ledger',
                'banners.manage', 'coupons.manage', 'discounts.manage',
                'rewards.view', 'affiliate.view', 'affiliate.manage',
                'expenses.view', 'expenses.manage',
                'reports.sales', 'reports.inventory',
                'shipping.manage', 'payments.manage',
                // A manager hires and removes shop staff, but cannot define
                // roles. UserPolicy::assignRoles then stops them minting an
                // account holding permissions they do not have themselves.
                'users.view', 'users.manage',
            ],

            'accountant' => [
                self::ADMIN_ACCESS, 'dashboard.view',
                'inventory.view', 'inventory.valuation',
                'suppliers.view', 'purchases.view', 'purchases.pay',
                'orders.view', 'orders.payment',
                'returns.view', 'returns.refund',
                'customers.view', 'customers.ledger',
                'expenses.view', 'expenses.manage',
                'incomes.view', 'incomes.manage',
                'accounting.view', 'accounting.post', 'accounts.manage',
                'affiliate.view', 'affiliate.payout',
                'reports.sales', 'reports.inventory', 'reports.financial',
                'audit.view',
            ],

            'stock_manager' => [
                self::ADMIN_ACCESS, 'dashboard.view',
                'products.view', 'products.create', 'products.update',
                'categories.manage', 'brands.manage', 'attributes.manage',
                'media.view', 'media.manage',
                'inventory.view', 'inventory.adjust', 'inventory.opening', 'inventory.valuation',
                'suppliers.view', 'suppliers.manage',
                'purchases.view', 'purchases.create', 'purchases.update',
                'purchases.receive', 'purchases.return',
                'orders.view', 'orders.status',
                'reports.inventory',
            ],

            'support' => [
                self::ADMIN_ACCESS, 'dashboard.view',
                'products.view', 'inventory.view', 'media.view',
                'orders.view', 'orders.status',
                'returns.view', 'returns.manage',
                'customers.view', 'customers.manage',
                'rewards.view',
            ],

            // Storefront accounts. No admin permissions at all.
            'customer' => [],
        ];
    }
}
