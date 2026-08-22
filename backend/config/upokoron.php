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

            // Shown next to store_phone in the header top bar. Free text
            // ("9am - 9pm, everyday") rather than structured hours -- a
            // shop's real hours ("closed Fridays except by WhatsApp") rarely
            // fit a rigid schedule picker anyway.
            'store_support_hours' => '',

            // Which header the storefront renders. 'classic': logo, search,
            // and a Shop/Offers/Contact nav in one bar. 'categories': a
            // support-info top bar, then a plain search bar with no category
            // button, then every top-level category along the bottom with
            // its children in a hover mega menu. Both stay in the codebase
            // so this is a one-setting switch, not a rebuild.
            'store_header_style' => 'categories',

            // Falls back to /logo.png in the frontend's public folder when
            // blank, so dropping the file in is enough to brand the site.
            'store_logo' => '',

            // Falls back to the static /favicon.svg shipped in the bundle
            // when blank. Swapped in client-side (see useFavicon), since the
            // browser tab icon is set once at page load and cannot come from
            // a build-time file for every store this codebase might run.
            'store_favicon' => '',

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

            // Shows an "Earn N points" line on the storefront product page.
            // Off on its own switch: a shop may run the program quietly
            // (still crediting purchases) without advertising it yet.
            'show_points_on_product_page' => true,

            // Earning.
            'points_per_hundred' => 5, // Points earned per BDT 100 spent (delivered orders).
            'review_points' => 10, // Points per approved product review.
            'profile_completion_points' => 50, // One-time bonus once name, phone and birthday are all on file.
            'birthday_points' => 200, // Awarded once a year, on the customer's birthday.

            // Redemption.
            'redemption_rate' => '1.00', // BDT discount per point spent.
            'min_redeem_points' => 50, // Smallest redemption a checkout will accept.
            'max_redeem_points' => 200, // Largest redemption a single order will accept.
            'max_redeem_percent_of_order' => 20, // Discount from points capped at this % of the cart subtotal.
            'expiry_days' => 365, // Points not spent within this many days of being earned expire, oldest first.

            // Not surfaced on the rewards settings screen yet -- kept for a
            // future referral feature.
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
    | format: standard (PREFIX-period-number) | compact (MMYYnumber, monthly reset only)
    */
    'sequences' => [
        // e.g. 08260001 for the first order of August 2026 -- short enough
        // to read out over the phone, which "ORD-2026-000001" was not.
        'order' => ['prefix' => 'ORD', 'padding' => 4, 'reset' => 'monthly', 'format' => 'compact'],
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
