<?php

declare(strict_types=1);

/*
|--------------------------------------------------------------------------
| Upokoron business configuration
|--------------------------------------------------------------------------
|
| These are DEFAULTS. Anything the store owner can change at runtime lives in
| the `settings` table and is read through SettingsService, which falls back
| to the values here when a key has never been set. Keys under `settings`
| below are seeded into the database by SettingsSeeder.
|
*/

return [

    /*
    | Money and locale. Amounts are stored as DECIMAL and handled as strings
    | via the Money value object -- never as PHP floats.
    */
    'currency' => [
        'code' => env('CURRENCY_CODE', 'BDT'),
        'symbol' => env('CURRENCY_SYMBOL', '৳'),
        'decimals' => 2,
    ],

    /*
    | Timestamps are stored in UTC. This is the timezone the business thinks
    | in: report day boundaries and displayed times both use it.
    */
    'display_timezone' => env('APP_DISPLAY_TIMEZONE', 'Asia/Dhaka'),

    /*
    | Column precision, kept in one place so migrations cannot drift apart.
    | See docs/phase-1-architecture.md section 1.3 for why cost carries six
    | decimals while stock value carries two.
    */
    'precision' => [
        'money' => [15, 2],
        'quantity' => [15, 3],
        'cost' => [15, 6],
    ],

    /*
    | Runtime-editable settings and their factory defaults.
    */
    'settings' => [

        /*
         * Public store identity. Everything in this group is exposed to the
         * storefront without authentication (see SettingsSeeder), because the
         * footer and contact page need it before anyone signs in.
         */
        'store' => [
            'store_name' => 'Upokoron.com',
            'store_tagline' => 'Electronics for everyone',
            'store_description' => 'Genuine electronics and accessories, stocked in Dhaka and '.
                'delivered to your door. Cash on delivery, warranty on every item, and returns '.
                'if something is not right.',
            'store_email' => 'support@upokoron.test',
            'store_phone' => '',
            'store_phone_alt' => '',
            'store_whatsapp' => '',
            'store_address' => '',

            // Falls back to /logo.png in the frontend's public folder when
            // blank, so dropping the file in is enough to brand the site.
            'store_logo' => '',

            // Social profiles. Blank means "we are not on that platform", and
            // the footer hides the icon rather than linking nowhere.
            'store_facebook' => '',
            'store_youtube' => '',
            'store_instagram' => '',
            'store_tiktok' => '',
        ],

        /*
         * Footer content pages.
         *
         * Empty by default and left that way on purpose: a privacy policy or
         * terms document has to describe what this specific shop actually
         * does, and shipping invented legal text would be worse than shipping
         * none. The owner writes these in Settings; until then each page says
         * so plainly rather than showing filler.
         */
        'pages' => [
            'page_about' => '',
            'page_privacy' => '',
            'page_terms' => '',
        ],

        'sales' => [
            // When revenue and COGS hit the ledger: 'shipped' or 'delivered'.
            // Default 'delivered' -- see architecture section 1.8 for why
            // confirmation-time recognition overstates sales in a COD market.
            'revenue_recognition_point' => 'delivered',

            // Minutes an unpaid online order may hold stock before its
            // reservation is released. COD orders reserve indefinitely.
            'reservation_ttl_minutes' => 30,

            // Days after delivery before a return can no longer be requested,
            // and before affiliate commission becomes payable.
            'return_window_days' => 7,

            'allow_guest_checkout' => true,
            'min_order_amount' => '0.00',
        ],

        'inventory' => [
            'allow_negative_stock' => false,
            'low_stock_alert' => true,
        ],

        // Setting keys are globally unique, not scoped by group -- the group
        // is only for arranging the settings screen. So keys carry their own
        // prefix where a bare name would collide across groups.
        'rewards' => [
            'rewards_enabled' => true,
            'signup_points' => 100,
            // Points earned per BDT 100 spent.
            'points_per_hundred' => 1,
            // BDT value of one point when redeemed.
            'redemption_rate' => '0.50',
            'min_redeem_points' => 100,
            'max_redeem_percent_of_order' => 20,
            'expiry_months' => 12,
            'referral_points' => 200,
        ],

        'affiliate' => [
            'affiliate_enabled' => true,
            'default_commission_type' => 'percentage',
            'default_commission_rate' => '5.00',
            'cookie_days' => 30,
            'min_payout_amount' => '500.00',
        ],

        'tax' => [
            'tax_enabled' => false,
            'tax_rate' => '0.00',
            'prices_include_tax' => false,
        ],
    ],

    /*
    | Document number formats. Consumed by DocumentNumberService, which
    | allocates numbers under a row lock so concurrent requests cannot
    | collide. reset: none | yearly | monthly
    */
    'sequences' => [
        'order' => ['prefix' => 'ORD', 'padding' => 6, 'reset' => 'yearly'],
        'purchase' => ['prefix' => 'PUR', 'padding' => 5, 'reset' => 'yearly'],
        'purchase_receipt' => ['prefix' => 'PRC', 'padding' => 5, 'reset' => 'yearly'],
        'purchase_return' => ['prefix' => 'PRT', 'padding' => 5, 'reset' => 'yearly'],
        'order_return' => ['prefix' => 'RET', 'padding' => 5, 'reset' => 'yearly'],
        'refund' => ['prefix' => 'REF', 'padding' => 5, 'reset' => 'yearly'],
        'journal_entry' => ['prefix' => 'JV', 'padding' => 6, 'reset' => 'yearly'],
        'expense' => ['prefix' => 'EXP', 'padding' => 5, 'reset' => 'yearly'],
        'income' => ['prefix' => 'INC', 'padding' => 5, 'reset' => 'yearly'],
        'stock_adjustment' => ['prefix' => 'ADJ', 'padding' => 5, 'reset' => 'yearly'],
        'payment' => ['prefix' => 'PAY', 'padding' => 6, 'reset' => 'yearly'],
        'affiliate_payout' => ['prefix' => 'APO', 'padding' => 5, 'reset' => 'yearly'],
        'customer' => ['prefix' => 'CUS', 'padding' => 6, 'reset' => 'none'],
        'supplier' => ['prefix' => 'SUP', 'padding' => 5, 'reset' => 'none'],
    ],

    /*
    | Models excluded from automatic audit logging (high-volume, low-value).
    */
    'audit' => [
        'enabled' => true,
        'ignore_attributes' => ['password', 'remember_token', 'updated_at'],
    ],
];
