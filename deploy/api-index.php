<?php

/**
 * Upokoron — production front controller.
 *
 * Deployed to  public_html/api/index.php  while the application itself lives
 * in  ~/laravel , one level above the document root. Nothing under ~/laravel
 * is reachable over the web, so .env, the source, and the logs cannot be
 * fetched by guessing a URL.
 *
 *   /home/USER/
 *   ├── laravel/          <- app, vendor, storage, .env
 *   └── public_html/
 *       ├── index.html    <- React build
 *       ├── uploads/      <- product images
 *       └── api/index.php <- this file
 */

use Illuminate\Foundation\Application;
use Illuminate\Http\Request;

define('LARAVEL_START', microtime(true));

/*
 * The application root, relative to this file. Change it only if you put
 * ~/laravel somewhere else. It must NOT be inside public_html.
 */
$app_root = __DIR__.'/../../laravel';

if (! is_file($app_root.'/vendor/autoload.php')) {
    http_response_code(500);
    header('Content-Type: text/plain; charset=utf-8');

    // A path mistake here is the single most common deployment error, so say
    // exactly what was looked for instead of a blank 500.
    exit(
        "Upokoron is not installed at the expected location.\n\n"
        ."Looked for: ".$app_root."/vendor/autoload.php\n"
        ."This file:  ".__FILE__."\n\n"
        ."Fix \$app_root at the top of api/index.php, or move the application there."
    );
}

/*
 * Make Laravel see the FULL request path.
 *
 * Because this front controller sits in a subdirectory, Symfony would derive
 * a base URL of "/api" from SCRIPT_NAME and hand Laravel the path
 * "v1/shop/products" -- with the "api" prefix already eaten. Every route
 * would then 404, which looks like a routing bug and is not one.
 *
 * Pretending the script is at the document root makes the base URL empty, so
 * the router receives "api/v1/shop/products", exactly as it does under
 * `php artisan serve` in development. Same paths in both places is worth more
 * than the small dishonesty in these two variables.
 */
$_SERVER['SCRIPT_NAME'] = '/index.php';
$_SERVER['PHP_SELF'] = '/index.php';

// Maintenance mode, if `php artisan down` was ever run.
if (file_exists($maintenance = $app_root.'/storage/framework/maintenance.php')) {
    require $maintenance;
}

require $app_root.'/vendor/autoload.php';

/** @var Application $app */
$app = require_once $app_root.'/bootstrap/app.php';

$app->handleRequest(Request::capture());
