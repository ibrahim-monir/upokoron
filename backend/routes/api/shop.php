<?php

declare(strict_types=1);

use App\Http\Controllers\Api\V1\Admin\SettingController;
use App\Http\Controllers\Api\V1\Auth\LoginController;
use App\Http\Controllers\Api\V1\Auth\PasswordController;
use App\Http\Controllers\Api\V1\Auth\ProfileController;
use App\Http\Controllers\Api\V1\Auth\RegisterController;
use App\Http\Controllers\Api\V1\Shop\ProductController;
use Illuminate\Support\Facades\Route;


/*
| Storefront API -- public browsing plus the signed-in customer's own account.
*/

Route::get('settings', [SettingController::class, 'publicSettings'])
    ->name('settings');


/*
| Public product catalog.
*/

Route::get('products', [ProductController::class, 'index'])
    ->name('products.index');

Route::get('products/{product:slug}', [ProductController::class, 'show'])
    ->name('products.show');


/*
| Guest-only auth.
*/

Route::middleware('throttle:auth')->group(function (): void {
    Route::post('auth/register', RegisterController::class)
        ->name('auth.register');

    Route::post('auth/login', [LoginController::class, 'store'])
        ->name('auth.login');

    Route::post('auth/forgot-password', [PasswordController::class, 'forgot'])
        ->name('auth.forgot');

    Route::post('auth/reset-password', [PasswordController::class, 'reset'])
        ->name('auth.reset');
});


Route::middleware(['auth:sanctum', 'account.active'])->group(function (): void {
    Route::post('auth/logout', [LoginController::class, 'destroy'])
        ->name('auth.logout');

    Route::get('auth/me', [ProfileController::class, 'show'])
        ->name('auth.me');

    Route::put('auth/profile', [ProfileController::class, 'update'])
        ->name('auth.profile.update');

    Route::put('auth/password', [PasswordController::class, 'update'])
        ->name('auth.password.update');
});