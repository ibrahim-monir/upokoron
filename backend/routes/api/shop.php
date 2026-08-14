<?php

declare(strict_types=1);

use App\Http\Controllers\Api\V1\Admin\SettingController;
use App\Http\Controllers\Api\V1\Auth\LoginController;
use App\Http\Controllers\Api\V1\Auth\PasswordController;
use App\Http\Controllers\Api\V1\Auth\ProfileController;
use App\Http\Controllers\Api\V1\Auth\RegisterController;
use App\Http\Controllers\Api\V1\Shop\AddressController;
use App\Http\Controllers\Api\V1\Shop\CartController;
use App\Http\Controllers\Api\V1\Shop\CategoryController;
use App\Http\Controllers\Api\V1\Shop\ProductController;
use App\Http\Controllers\Api\V1\Shop\ShippingController;
use Illuminate\Support\Facades\Route;

/*
| Storefront API -- public browsing plus the signed-in customer's own account.
*/

Route::get('settings', [SettingController::class, 'publicSettings'])
    ->name('settings');

/*
| Public product catalog.
*/

// Categories for the storefront navigation, and the per-category product
// strips the home page shows -- one request for the whole home page, rather
// than one per strip.
Route::get('categories', [CategoryController::class, 'index'])
    ->name('categories.index');

Route::get('categories/featured', [CategoryController::class, 'featured'])
    ->name('categories.featured');

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

/*
| The basket.
|
| Guests included: a shopper must be able to fill a cart before deciding
| whether to make an account. The cart is identified by a token the server
| sets as a cookie, so signing in later keeps the basket rather than
| replacing it with an empty one.
*/

Route::get('cart', [CartController::class, 'show'])->name('cart.show');
Route::post('cart/items', [CartController::class, 'store'])->name('cart.items.store');
Route::put('cart/items/{item}', [CartController::class, 'update'])->name('cart.items.update');
Route::delete('cart/items/{item}', [CartController::class, 'destroy'])->name('cart.items.destroy');
Route::delete('cart', [CartController::class, 'clear'])->name('cart.clear');

/*
| Delivery charges. Public, because "what does delivery cost to my area?" is
| a question people ask before they are willing to register.
*/

Route::get('shipping/zones', [ShippingController::class, 'zones'])->name('shipping.zones');
Route::post('shipping/quote', [ShippingController::class, 'quote'])->name('shipping.quote');

Route::middleware(['auth:sanctum', 'account.active'])->group(function (): void {
    Route::post('auth/logout', [LoginController::class, 'destroy'])
        ->name('auth.logout');

    // The customer's own address book.
    Route::get('addresses', [AddressController::class, 'index'])->name('addresses.index');
    Route::post('addresses', [AddressController::class, 'store'])->name('addresses.store');
    Route::put('addresses/{address}', [AddressController::class, 'update'])->name('addresses.update');
    Route::delete('addresses/{address}', [AddressController::class, 'destroy'])->name('addresses.destroy');

    Route::get('auth/me', [ProfileController::class, 'show'])
        ->name('auth.me');

    Route::put('auth/profile', [ProfileController::class, 'update'])
        ->name('auth.profile.update');

    Route::put('auth/password', [PasswordController::class, 'update'])
        ->name('auth.password.update');
});
