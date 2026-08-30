<?php

use App\Http\Controllers\Api\V1\SitemapController;
use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    return view('welcome');
});

// Registered here, unprefixed, rather than in routes/api.php (which Laravel
// auto-prefixes with /api): public_html/.htaccess rewrites the bare root URL
// /sitemap.xml straight to this front controller -- the same trick it
// already uses for /sanctum and /up -- because that is the URL Search
// Console expects, not one buried under /api.
// No session, no CSRF: a crawler hitting this repeatedly should not force a
// database session read/write on every request, and GET needs no CSRF token.
Route::get('sitemap.xml', SitemapController::class)
    ->withoutMiddleware('web')
    ->name('sitemap');
