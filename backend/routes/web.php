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

// XSL stylesheets the XML views above link to via an xml-stylesheet
// processing instruction, so a person opening any of these URLs in a
// browser sees a table of clickable links rather than the raw document
// tree. Crawlers never fetch these -- they read the XML directly.
Route::get('sitemap-index.xsl', [SitemapController::class, 'indexStylesheet'])
    ->withoutMiddleware('web')
    ->name('sitemap.index.xsl');

Route::get('sitemap-urlset.xsl', [SitemapController::class, 'urlsetStylesheet'])
    ->withoutMiddleware('web')
    ->name('sitemap.urlset.xsl');

// A segment's first (and maybe only) batch, e.g. /sitemap-products.xml --
// unnumbered, so a segment that never outgrows 200 URLs keeps one stable
// filename instead of forever being "...-1.xml". Segment gets its pattern
// spelled out because Laravel's default excludes "-" here, which would
// otherwise cut a hyphenated name like "product-categories" off at its
// first dash. The controller 404s on an unknown segment name.
Route::get('sitemap-{segment}.xml', [SitemapController::class, 'show'])
    ->where('segment', '[a-z-]+')
    ->withoutMiddleware('web')
    ->name('sitemap.show');

// A segment's second batch onward, e.g. /sitemap-products-2.xml. Batch is
// constrained to 2+ so this route never overlaps the unnumbered one above --
// "sitemap-products-1.xml" is not a valid URL, only "sitemap-products.xml".
Route::get('sitemap-{segment}-{batch}.xml', [SitemapController::class, 'show'])
    ->where(['segment' => '[a-z-]+', 'batch' => '[2-9][0-9]*'])
    ->withoutMiddleware('web')
    ->name('sitemap.show.batch');
