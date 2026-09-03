<?php

declare(strict_types=1);

use App\Http\Controllers\Api\V1\Webhooks\WhatsAppWebhookController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| API v1
|--------------------------------------------------------------------------
|
| Two route trees, split by audience rather than by module:
|
|   /api/v1/shop    public storefront + signed-in customer
|   /api/v1/admin   staff, gated by admin.access plus a per-route permission
|
| Both live in their own file so a module landing in a later phase adds
| routes in exactly one predictable place.
|
*/

Route::prefix('v1')->group(function (): void {
    Route::prefix('shop')->name('shop.')->group(base_path('routes/api/shop.php'));
    Route::prefix('admin')->name('admin.')->group(base_path('routes/api/admin.php'));

    /*
    | Webhooks.
    |
    | Neither shop nor admin: Meta's servers hold no session and no token of
    | ours, so these authenticate themselves by signature instead. See
    | WhatsAppWebhookController.
    */
    Route::prefix('webhooks')->name('webhooks.')->group(function (): void {
        Route::get('whatsapp', [WhatsAppWebhookController::class, 'verify'])->name('whatsapp.verify');
        Route::post('whatsapp', [WhatsAppWebhookController::class, 'receive'])->name('whatsapp.receive');
    });

    Route::get('/health', fn () => response()->json([
        'success' => true,
        'message' => 'Upokoron API is running',
        'version' => 'v1',
    ]));
});

Route::get('/', fn () => response()->json([
    'name' => config('app.name'),
    'api' => 'v1',
    'status' => 'ok',
]));
