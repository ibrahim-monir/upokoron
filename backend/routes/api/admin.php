<?php

declare(strict_types=1);

use App\Http\Controllers\Api\V1\Admin\AccountController;
use App\Http\Controllers\Api\V1\Admin\AccountingReportController;
use App\Http\Controllers\Api\V1\Admin\AttributeController;
use App\Http\Controllers\Api\V1\Admin\AuditLogController;
use App\Http\Controllers\Api\V1\Admin\BannerController;
use App\Http\Controllers\Api\V1\Admin\BrandController;
use App\Http\Controllers\Api\V1\Admin\CategoryController;
use App\Http\Controllers\Api\V1\Admin\CouponController;
use App\Http\Controllers\Api\V1\Admin\DashboardController;
use App\Http\Controllers\Api\V1\Admin\InventoryController;
use App\Http\Controllers\Api\V1\Admin\JournalEntryController;
use App\Http\Controllers\Api\V1\Admin\MediaController;
use App\Http\Controllers\Api\V1\Admin\OrderController;
use App\Http\Controllers\Api\V1\Admin\PaymentMethodController;
use App\Http\Controllers\Api\V1\Admin\ProductController;
use App\Http\Controllers\Api\V1\Admin\ProductImageController;
use App\Http\Controllers\Api\V1\Admin\ProductImportController;
use App\Http\Controllers\Api\V1\Admin\RewardController;
use App\Http\Controllers\Api\V1\Admin\ContactMessageController;
use App\Http\Controllers\Api\V1\Admin\FaqController;
use App\Http\Controllers\Api\V1\Admin\QuestionController;
use App\Http\Controllers\Api\V1\Admin\ReviewController;
use App\Http\Controllers\Api\V1\Admin\RoleController;
use App\Http\Controllers\Api\V1\Admin\SettingController;
use App\Http\Controllers\Api\V1\Admin\ShippingZoneController;
use App\Http\Controllers\Api\V1\Admin\SitemapController;
use App\Http\Controllers\Api\V1\Admin\UnitController;
use App\Http\Controllers\Api\V1\Admin\UserController;
use App\Http\Controllers\Api\V1\Auth\LoginController;
use Illuminate\Support\Facades\Route;

/*
| Admin API. Everything past the login route requires an authenticated,
| active account holding `admin.access`; individual endpoints then declare
| their own permission through a policy or an explicit check.
*/

Route::post('auth/login', [LoginController::class, 'storeAdmin'])
    ->middleware('throttle:auth')
    ->name('auth.login');

Route::middleware(['auth:sanctum', 'account.active', 'admin.access'])->group(function (): void {

    Route::post('auth/logout', [LoginController::class, 'destroy'])->name('auth.logout');

    // Users
    Route::apiResource('users', UserController::class);
    Route::post('users/{id}/restore', [UserController::class, 'restore'])
        ->whereNumber('id')
        ->name('users.restore');

    // Roles and the permission catalogue
    Route::get('permissions', [RoleController::class, 'permissions'])->name('permissions.index');
    Route::apiResource('roles', RoleController::class);

    // Settings
    Route::get('settings', [SettingController::class, 'index'])->name('settings.index');
    Route::put('settings', [SettingController::class, 'update'])->name('settings.update');

    // The XML sitemap. Content is derived, not stored, so there is nothing
    // to edit here -- just what is currently in it and a way to force a
    // rebuild before the hourly cache would otherwise expire.
    Route::get('sitemap', [SitemapController::class, 'index'])->name('sitemap.index');
    Route::post('sitemap/regenerate', [SitemapController::class, 'regenerate'])->name('sitemap.regenerate');

    // Audit trail
    Route::get('audit-logs', [AuditLogController::class, 'index'])->name('audit-logs.index');
    Route::get('audit-logs/{auditLog}', [AuditLogController::class, 'show'])->name('audit-logs.show');

    /*
    |----------------------------------------------------------------------
    | Catalog
    |----------------------------------------------------------------------
    */

    // Image library. Uploaded once, reused by products, categories, brands,
    // and the store logo.
    Route::get('media', [MediaController::class, 'index'])->name('media.index');
    Route::post('media', [MediaController::class, 'store'])->name('media.store');
    Route::put('media/{medium}', [MediaController::class, 'update'])->name('media.update');
    Route::delete('media/{medium}', [MediaController::class, 'destroy'])->name('media.destroy');

    Route::apiResource('categories', CategoryController::class);
    Route::post('categories/reorder', [CategoryController::class, 'reorder'])->name('categories.reorder');
    Route::post('categories/bulk', [CategoryController::class, 'bulk'])->name('categories.bulk');
    Route::apiResource('brands', BrandController::class);
    Route::apiResource('attributes', AttributeController::class);
    Route::apiResource('units', UnitController::class)->except('show');

    // Home page hero slides.
    Route::apiResource('banners', BannerController::class)->except('show');
    Route::post('banners/reorder', [BannerController::class, 'reorder'])->name('banners.reorder');

    // Preview the variations an attribute selection would create, before
    // committing to generating them.
    Route::post('products/preview-variations', [ProductController::class, 'previewVariations'])
        ->name('products.preview-variations');

    // Publish, feature or withdraw several at once. Declared before the
    // apiResource, or {product} would swallow "bulk" as an id.
    Route::post('products/bulk', [ProductController::class, 'bulk'])->name('products.bulk');

    /*
     * Import. Three segments, so none of these collide with
     * `products/{product}`, but they are declared up here with the rest of
     * the non-resource product routes anyway.
     *
     * `scrape` makes the server fetch an address a person typed, which is
     * the one outbound request in this application that a user controls --
     * hence its own, tighter rate limit.
     */
    Route::post('products/import/scrape', [ProductImportController::class, 'scrape'])
        ->middleware('throttle:import')
        ->name('products.import.scrape');
    Route::post('products/import/csv', [ProductImportController::class, 'csv'])
        ->middleware('throttle:import')
        ->name('products.import.csv');
    Route::get('products/import/template', [ProductImportController::class, 'template'])
        ->name('products.import.template');

    // Before apiResource, or `products/{product}` would swallow nothing --
    // but keep it here anyway so the whole product surface reads in one
    // place rather than half of it appearing after the resource line.
    Route::post('products/{product}/duplicate', [ProductController::class, 'duplicate'])
        ->name('products.duplicate');

    Route::apiResource('products', ProductController::class);
    Route::post('products/{id}/restore', [ProductController::class, 'restore'])
        ->whereNumber('id')
        ->name('products.restore');

    Route::post('products/{product}/images', [ProductImageController::class, 'store'])->name('products.images.store');
    Route::delete('products/{product}/images/{image}', [ProductImageController::class, 'destroy'])->name('products.images.destroy');
    Route::post('products/{product}/images/{image}/primary', [ProductImageController::class, 'makePrimary'])->name('products.images.primary');
    Route::post('products/{product}/images/reorder', [ProductImageController::class, 'reorder'])->name('products.images.reorder');

    // Review moderation.
    Route::get('reviews', [ReviewController::class, 'index'])->name('reviews.index');
    Route::put('reviews/{review}/status', [ReviewController::class, 'updateStatus'])->name('reviews.status');
    Route::delete('reviews/{review}', [ReviewController::class, 'destroy'])->name('reviews.destroy');

    // Product questions: the only place an answer can be written.
    Route::get('questions', [QuestionController::class, 'index'])->name('questions.index');
    Route::put('questions/{question}/answer', [QuestionController::class, 'answer'])->name('questions.answer');
    Route::put('questions/{question}/status', [QuestionController::class, 'updateStatus'])->name('questions.status');
    Route::delete('questions/{question}', [QuestionController::class, 'destroy'])->name('questions.destroy');

    Route::get('faqs', [FaqController::class, 'index'])->name('faqs.index');
    Route::post('faqs', [FaqController::class, 'store'])->name('faqs.store');
    Route::put('faqs/reorder', [FaqController::class, 'reorder'])->name('faqs.reorder');
    Route::put('faqs/{faq}', [FaqController::class, 'update'])->name('faqs.update');
    Route::delete('faqs/{faq}', [FaqController::class, 'destroy'])->name('faqs.destroy');

    Route::get('contact-messages', [ContactMessageController::class, 'index'])->name('contact.index');
    Route::put('contact-messages/{message}/status', [ContactMessageController::class, 'updateStatus'])->name('contact.status');
    Route::delete('contact-messages/{message}', [ContactMessageController::class, 'destroy'])->name('contact.destroy');

    /*
    |----------------------------------------------------------------------
    | Inventory
    |----------------------------------------------------------------------
    */

    Route::get('inventory', [InventoryController::class, 'index'])->name('inventory.index');
    Route::get('inventory/valuation', [InventoryController::class, 'valuation'])->name('inventory.valuation');
    Route::post('inventory/adjust', [InventoryController::class, 'adjust'])->name('inventory.adjust');
    Route::get('inventory/{variation}/movements', [InventoryController::class, 'movements'])
        ->name('inventory.movements');
    Route::put('inventory/{variation}/levels', [InventoryController::class, 'updateLevels'])
        ->name('inventory.levels');

    /*
    |----------------------------------------------------------------------
    | Accounting
    |----------------------------------------------------------------------
    */

    // Chart of accounts
    Route::get('accounts/types', [AccountController::class, 'types'])->name('accounts.types');
    Route::apiResource('accounts', AccountController::class);

    // Journal. There is no update or delete route: posted entries are
    // immutable, and a correction is a reversal.
    Route::get('journal-entries', [JournalEntryController::class, 'index'])->name('journal-entries.index');
    Route::post('journal-entries', [JournalEntryController::class, 'store'])->name('journal-entries.store');
    Route::get('journal-entries/{journalEntry}', [JournalEntryController::class, 'show'])->name('journal-entries.show');
    Route::post('journal-entries/{journalEntry}/reverse', [JournalEntryController::class, 'reverse'])
        ->name('journal-entries.reverse');

    // Reports
    Route::get('reports/trial-balance', [AccountingReportController::class, 'trialBalance'])->name('reports.trial-balance');
    Route::get('reports/profit-loss', [AccountingReportController::class, 'profitAndLoss'])->name('reports.profit-loss');
    Route::get('reports/account-ledger/{account}', [AccountingReportController::class, 'accountLedger'])
        ->name('reports.account-ledger');

    // Fiscal periods
    Route::get('fiscal-periods', [AccountingReportController::class, 'periods'])->name('fiscal-periods.index');
    Route::post('fiscal-years', [AccountingReportController::class, 'createFiscalYear'])->name('fiscal-years.store');
    Route::post('fiscal-periods/{period}/close', [AccountingReportController::class, 'closePeriod'])
        ->name('fiscal-periods.close');
    Route::post('fiscal-periods/{period}/reopen', [AccountingReportController::class, 'reopenPeriod'])
        ->name('fiscal-periods.reopen');

    // Everything the dashboard shows, in one request rather than five.
    Route::get('dashboard', DashboardController::class)->name('dashboard');

    // Orders. Status changes are what post to the ledger, so they are gated
    // separately from merely reading the list.
    Route::get('orders', [OrderController::class, 'index'])->name('orders.index');
    Route::get('orders/{order}', [OrderController::class, 'show'])->name('orders.show');
    Route::put('orders/{order}/status', [OrderController::class, 'updateStatus'])->name('orders.status');
    Route::post('orders/{order}/payments', [OrderController::class, 'recordPayment'])->name('orders.payments');
    Route::post('orders/{order}/refunds', [OrderController::class, 'refund'])->name('orders.refunds');
    Route::put('orders/{order}/note', [OrderController::class, 'addNote'])->name('orders.note');

    // Delivery zones, the places in them, and what each charges.
    Route::get('shipping/zones', [ShippingZoneController::class, 'index'])->name('shipping.zones.index');

    // "Which zone does this address fall in, and what would it cost?"
    Route::post('shipping/test', [ShippingZoneController::class, 'test'])->name('shipping.test');

    Route::post('shipping/zones', [ShippingZoneController::class, 'store'])->name('shipping.zones.store');
    Route::put('shipping/zones/{zone}', [ShippingZoneController::class, 'update'])->name('shipping.zones.update');
    Route::delete('shipping/zones/{zone}', [ShippingZoneController::class, 'destroy'])->name('shipping.zones.destroy');
    Route::put('shipping/zones/{zone}/areas', [ShippingZoneController::class, 'syncAreas'])
        ->name('shipping.zones.areas');

    Route::post('shipping/zones/{zone}/rates', [ShippingZoneController::class, 'storeRate'])
        ->name('shipping.rates.store');
    Route::put('shipping/zones/{zone}/rates/{rate}', [ShippingZoneController::class, 'updateRate'])
        ->name('shipping.rates.update');
    Route::delete('shipping/zones/{zone}/rates/{rate}', [ShippingZoneController::class, 'destroyRate'])
        ->name('shipping.rates.destroy');

    // How the shop gets paid.
    Route::get('payment-methods', [PaymentMethodController::class, 'index'])->name('payment-methods.index');
    Route::post('payment-methods', [PaymentMethodController::class, 'store'])->name('payment-methods.store');
    Route::put('payment-methods/{paymentMethod}', [PaymentMethodController::class, 'update'])
        ->name('payment-methods.update');
    Route::delete('payment-methods/{paymentMethod}', [PaymentMethodController::class, 'destroy'])
        ->name('payment-methods.destroy');

    // Discount codes.
    Route::get('coupons', [CouponController::class, 'index'])->name('coupons.index');
    Route::post('coupons', [CouponController::class, 'store'])->name('coupons.store');
    Route::put('coupons/{coupon}', [CouponController::class, 'update'])->name('coupons.update');
    Route::delete('coupons/{coupon}', [CouponController::class, 'destroy'])->name('coupons.destroy');

    // Loyalty points.
    Route::get('rewards/settings', [RewardController::class, 'settings'])->name('rewards.settings');
    Route::put('rewards/settings', [RewardController::class, 'updateSettings'])->name('rewards.settings.update');
    Route::get('rewards/customers', [RewardController::class, 'customers'])->name('rewards.customers');
    Route::get('rewards/customers/{customer}/history', [RewardController::class, 'history'])
        ->name('rewards.customers.history');
    Route::post('rewards/adjustments', [RewardController::class, 'adjust'])->name('rewards.adjustments');
});
