<?php

declare(strict_types=1);

use App\Http\Controllers\Api\V1\Admin\AccountController;
use App\Http\Controllers\Api\V1\Admin\AccountingReportController;
use App\Http\Controllers\Api\V1\Admin\AttributeController;
use App\Http\Controllers\Api\V1\Admin\AuditLogController;
use App\Http\Controllers\Api\V1\Admin\BrandController;
use App\Http\Controllers\Api\V1\Admin\CategoryController;
use App\Http\Controllers\Api\V1\Admin\InventoryController;
use App\Http\Controllers\Api\V1\Admin\JournalEntryController;
use App\Http\Controllers\Api\V1\Admin\ProductController;
use App\Http\Controllers\Api\V1\Admin\ProductImageController;
use App\Http\Controllers\Api\V1\Admin\RoleController;
use App\Http\Controllers\Api\V1\Admin\SettingController;
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

    // Audit trail
    Route::get('audit-logs', [AuditLogController::class, 'index'])->name('audit-logs.index');
    Route::get('audit-logs/{auditLog}', [AuditLogController::class, 'show'])->name('audit-logs.show');

    /*
    |----------------------------------------------------------------------
    | Catalog
    |----------------------------------------------------------------------
    */

    Route::apiResource('categories', CategoryController::class);
    Route::apiResource('brands', BrandController::class);
    Route::apiResource('attributes', AttributeController::class);
    Route::apiResource('units', UnitController::class)->except('show');

    // Preview the variations an attribute selection would create, before
    // committing to generating them.
    Route::post('products/preview-variations', [ProductController::class, 'previewVariations'])
        ->name('products.preview-variations');

    Route::apiResource('products', ProductController::class);
    Route::post('products/{id}/restore', [ProductController::class, 'restore'])
        ->whereNumber('id')
        ->name('products.restore');

    Route::post('products/{product}/images', [ProductImageController::class, 'store'])->name('products.images.store');
    Route::delete('products/{product}/images/{image}', [ProductImageController::class, 'destroy'])->name('products.images.destroy');
    Route::post('products/{product}/images/{image}/primary', [ProductImageController::class, 'makePrimary'])->name('products.images.primary');
    Route::post('products/{product}/images/reorder', [ProductImageController::class, 'reorder'])->name('products.images.reorder');

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
});
