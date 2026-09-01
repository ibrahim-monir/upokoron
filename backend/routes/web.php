<?php

use App\Http\Controllers\Api\V1\SitemapController;
use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    return view('welcome');
});

// Registered here, unprefixed, rather than in routes/api.php (which Laravel
// auto-prefixes with /api): public_html/.htaccess rewrites bare root URLs
// under /sitemap* straight to this front controller -- the same trick it
// already uses for /sanctum and /up -- because that is where Search Console
// and crawlers expect them, not buried under /api.
// No session, no CSRF: a crawler hitting these repeatedly should not force a
// database session read/write on every request, and GET needs no CSRF token.
Route::get('sitemap.xml', [SitemapController::class, 'index'])
    ->withoutMiddleware('web')
    ->name('sitemap.index');

// One batch of a single content type, e.g. /sitemap-products-2.xml.
// Adjacent route parameters default to excluding "-" from their own match
// (Laravel's ambiguity guard), which would otherwise cut a hyphenated
// segment name like "product-categories" off at its first dash -- so both
// patterns are given explicitly. The controller still 404s on an unknown
// segment name.
Route::get('sitemap-{segment}-{batch}.xml', [SitemapController::class, 'show'])
    ->where(['segment' => '[a-z-]+', 'batch' => '[0-9]+'])
    ->withoutMiddleware('web')
    ->name('sitemap.show');
