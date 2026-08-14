<#
.SYNOPSIS
    Builds the cPanel upload bundle for Upokoron.

.DESCRIPTION
    Produces deploy/build/ containing exactly what goes on the server:

        laravel/       -> upload to /home/USER/laravel   (above the web root)
        public_html/   -> upload to /home/USER/public_html

    and zips each one, because cPanel's File Manager uploads a single archive
    far faster than several thousand loose files.

    Composer dependencies are installed HERE, not on the server. Most basic
    cPanel plans have no Terminal and no Composer, and even where they do,
    `composer install` regularly exceeds the memory limit. Shipping vendor/
    in the bundle removes that whole class of problem.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File deploy\build.ps1
#>

[CmdletBinding()]
param(
    # Skip `npm ci` when node_modules is already current -- saves a few minutes
    # on repeat builds.
    [switch] $SkipNpmInstall,

    # Leave the built folders unzipped (useful when uploading over FTP/rsync).
    [switch] $NoZip
)

$ErrorActionPreference = 'Stop'

$root      = Split-Path -Parent $PSScriptRoot
$backend   = Join-Path $root 'backend'
$frontend  = Join-Path $root 'frontend'
$deploy    = Join-Path $root 'deploy'
$build     = Join-Path $deploy 'build'
$appOut    = Join-Path $build 'laravel'
$webOut    = Join-Path $build 'public_html'

function Step($message) {
    Write-Host ''
    Write-Host "==> $message" -ForegroundColor Cyan
}

function Fail($message) {
    Write-Host ''
    Write-Host "FAILED: $message" -ForegroundColor Red
    exit 1
}

function Require-Tool($name, $hint) {
    $found = Get-Command $name -ErrorAction SilentlyContinue

    if ($null -eq $found) {
        Fail "'$name' was not found on PATH. $hint"
    }

    return $found.Source
}

# ---------------------------------------------------------------- checks

Step 'Checking the toolchain'

Require-Tool 'node'     'Install Node.js 20+ from nodejs.org.'          | Out-Null
Require-Tool 'npm'      'Comes with Node.js.'                            | Out-Null
Require-Tool 'php'      'Laragon provides it; make sure it is on PATH.'  | Out-Null
Require-Tool 'composer' 'Install from getcomposer.org.'                  | Out-Null

# The bundle carries a vendor/ directory resolved on this machine, so the PHP
# here has to satisfy the project's own floor.
#
# Which PHP the *server* needs is a separate question, and it is pinned in
# composer.json under config.platform. Without that pin, building on 8.4 pulls
# in Symfony 8 (which requires >= 8.4.1) and the bundle then dies on any host
# still offering 8.3 -- and plenty of basic cPanel plans do. The pin is
# verified after composer runs, below.
$phpVersion = (& php -r 'echo PHP_VERSION;')

if ([version]($phpVersion -replace '[^0-9.].*$','') -lt [version]'8.3.0') {
    Fail "Local PHP is $phpVersion but composer.json requires ^8.3. Point PATH at PHP 8.3+ (Laragon: Menu -> PHP -> Version)."
}

Write-Host "    PHP      $phpVersion"
Write-Host "    Node     $(& node --version)"

# ------------------------------------------------------------- clean out

Step 'Clearing the previous build'

if (Test-Path $build) {
    Remove-Item $build -Recurse -Force
}

New-Item -ItemType Directory -Path $appOut -Force | Out-Null
New-Item -ItemType Directory -Path $webOut -Force | Out-Null

# --------------------------------------------------------------- backend

Step 'Copying the application'

# Everything the app needs at runtime, and nothing else. Tests, the local
# .env, and the development public/ folder all stay behind: .env in
# particular must never travel in a bundle, because a bundle gets emailed,
# copied to a USB stick, and left in a Downloads folder.
$appIncludes = @(
    'app', 'bootstrap', 'config', 'database', 'lang', 'resources', 'routes',
    'artisan', 'composer.json', 'composer.lock'
)

foreach ($item in $appIncludes) {
    $source = Join-Path $backend $item

    if (-not (Test-Path $source)) { continue }

    Copy-Item $source -Destination $appOut -Recurse -Force
}

# bootstrap/cache ships empty: a cached config file baked from the local .env
# would point the live site at the development database.
$bootstrapCache = Join-Path $appOut 'bootstrap\cache'

if (Test-Path $bootstrapCache) {
    Get-ChildItem $bootstrapCache -File | Remove-Item -Force
}

# storage/ is recreated empty rather than copied -- local logs are nobody
# else's business and can be large.
foreach ($dir in @(
    'storage\app\private', 'storage\app\public',
    'storage\framework\cache\data', 'storage\framework\sessions',
    'storage\framework\testing', 'storage\framework\views',
    'storage\logs'
)) {
    New-Item -ItemType Directory -Path (Join-Path $appOut $dir) -Force | Out-Null

    # Empty directories vanish inside a zip; a .gitignore keeps each one alive
    # so Laravel does not fail on a missing storage path after extraction.
    Set-Content -Path (Join-Path $appOut "$dir\.gitignore") -Value "*`n!.gitignore" -Encoding utf8 -NoNewline
}

Step 'Installing production dependencies (composer, no dev packages)'

Push-Location $appOut

try {
    # --no-dev drops phpunit, faker, and friends: roughly 40 MB less to upload,
    # and none of it should exist on a production server anyway.
    & composer install --no-dev --optimize-autoloader --no-interaction --no-progress --classmap-authoritative

    if ($LASTEXITCODE -ne 0) { Fail 'composer install failed.' }
} finally {
    Pop-Location
}

# Composer writes the minimum PHP the resolved packages actually need into
# platform_check.php, and that file aborts the request on a server below it.
# Read it back rather than trusting the pin: a stale composer.lock resolved on
# someone else's machine would sail past every other check here and only fail
# after upload, as a 500 with no message.
$platformCheck = Join-Path $appOut 'vendor\composer\platform_check.php'
$floor = (Select-String -Path $platformCheck -Pattern 'PHP_VERSION_ID >= (\d+)').Matches[0].Groups[1].Value

if ([int]$floor -gt 80399) {
    Fail "The bundle requires PHP $floor or newer, which rules out hosts on 8.3. Run 'composer update' in backend/ so config.platform (php 8.3.0) takes effect, then build again."
}

$n = [int]$floor
$floorLabel = '{0}.{1}.{2}' -f [math]::Floor($n / 10000), [math]::Floor(($n % 10000) / 100), ($n % 100)

Write-Host "    vendor/  needs PHP $floorLabel or newer on the server"

# --------------------------------------------------------------- frontend

Step 'Building the React app'

Push-Location $frontend

try {
    if (-not $SkipNpmInstall) {
        & npm ci

        if ($LASTEXITCODE -ne 0) { Fail 'npm ci failed.' }
    }

    & npm run build

    if ($LASTEXITCODE -ne 0) { Fail 'The frontend build failed.' }
} finally {
    Pop-Location
}

$dist = Join-Path $frontend 'dist'

if (-not (Test-Path (Join-Path $dist 'index.html'))) {
    Fail "The build produced no index.html in $dist."
}

Copy-Item (Join-Path $dist '*') -Destination $webOut -Recurse -Force

# --------------------------------------------------------- web root extras

Step 'Assembling the web root'

# The API front controller, in its own directory.
$apiOut = Join-Path $webOut 'api'
New-Item -ItemType Directory -Path $apiOut -Force | Out-Null

Copy-Item (Join-Path $deploy 'api-index.php') -Destination (Join-Path $apiOut 'index.php') -Force
Copy-Item (Join-Path $deploy 'api.htaccess')  -Destination (Join-Path $apiOut '.htaccess')  -Force

# Anything Laravel's own public/ folder still needs (robots.txt, favicon).
foreach ($file in @('robots.txt', 'favicon.ico')) {
    $source = Join-Path $backend "public\$file"

    if ((Test-Path $source) -and -not (Test-Path (Join-Path $webOut $file))) {
        Copy-Item $source -Destination $webOut -Force
    }
}

Copy-Item (Join-Path $deploy 'public_html.htaccess') -Destination (Join-Path $webOut '.htaccess') -Force

# Product images land here. Created with an index.html so a misconfigured
# server cannot list the directory even if Options -Indexes is ignored.
$uploads = Join-Path $webOut 'uploads'
New-Item -ItemType Directory -Path $uploads -Force | Out-Null
Copy-Item (Join-Path $deploy 'uploads.htaccess') -Destination (Join-Path $uploads '.htaccess') -Force
Set-Content -Path (Join-Path $uploads 'index.html') -Value '' -Encoding utf8

# The hosting check, so it is on hand if something misbehaves after upload.
Copy-Item (Join-Path $deploy 'preflight.php') -Destination $webOut -Force

# The one-click installer, so a plan without Terminal still gets a correct
# setup. It is inert until INSTALL_TOKEN is set in .env, and deletes itself
# when it is done.
Copy-Item (Join-Path $deploy 'install.php') -Destination $webOut -Force

# The update endpoint. Runs migrations and rebuilds caches, and nothing else --
# it accepts no files, so a leaked token cannot put code on the site.
Copy-Item (Join-Path $deploy 'update.php') -Destination $webOut -Force

# Stamp the build so the server can say which code it is actually running.
# The commonest update mistake is extracting the zip in the wrong place; then
# the site looks unchanged and there is nothing on screen to explain why.
$commit = (& git -C $root rev-parse --short HEAD 2>$null)

if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($commit)) {
    $commit = 'unknown'
}

$dirty = (& git -C $root status --porcelain 2>$null)

if (-not [string]::IsNullOrWhiteSpace($dirty)) {
    # Built from a working tree with uncommitted edits: say so, or the commit
    # in build.json is a lie about what is on the server.
    $commit = "$commit+local"
}

# WriteAllText with a BOM-less encoder, not Set-Content -Encoding utf8:
# on Windows PowerShell 5.1 that writes a UTF-8 BOM, and json_decode returns
# null on the leading bytes. The file looks perfect in every editor and the
# server reports it unreadable.
[System.IO.File]::WriteAllText(
    (Join-Path $appOut 'build.json'),
    (@{ commit = $commit; built_at = (Get-Date -Format 'yyyy-MM-dd HH:mm') } | ConvertTo-Json -Compress),
    (New-Object System.Text.UTF8Encoding $false)
)

Write-Host "    build    $commit"

# The .env template travels beside the bundle, never inside laravel/, so it
# cannot be mistaken for a working file and left with placeholder values.
Copy-Item (Join-Path $deploy 'env.production.example') -Destination $build -Force

# ------------------------------------------------------------------ zip

if (-not $NoZip) {
    Step 'Zipping'

    # Not Compress-Archive: on Windows PowerShell 5.1 it stores paths with
    # backslashes, and cPanel's extractor then produces a flat file literally
    # named "api\.htaccess" instead of a directory. See make-zip.php.
    $zipper = Join-Path $deploy 'make-zip.php'

    # --prefix so this extracts to <somewhere>/laravel/ no matter where the
    # person extracts it. public_html.zip stays flat on purpose: its contents
    # go directly into an existing public_html.
    & php $zipper $appOut (Join-Path $build 'laravel.zip') --prefix=laravel `
        'laravel/artisan' 'laravel/vendor/autoload.php' 'laravel/bootstrap/app.php' `
        'laravel/storage/logs/.gitignore'

    if ($LASTEXITCODE -ne 0) { Fail 'laravel.zip is incomplete.' }

    # The dotfiles are the whole deployment: without api/.htaccess every route
    # 404s, and without uploads/.htaccess the image directory can execute what
    # it is handed.
    & php $zipper $webOut (Join-Path $build 'public_html.zip') `
        'index.html' 'api/index.php' '.htaccess' 'api/.htaccess' 'uploads/.htaccess' `
        'install.php' 'preflight.php' 'update.php'

    if ($LASTEXITCODE -ne 0) { Fail 'public_html.zip is incomplete.' }

    # ---------------------------------------------------------- update.zip
    #
    # The routine deploy. vendor/ is 7 of the full bundle's 8 MB and changes
    # only when a package is added, so leaving it out turns a three-minute
    # upload into a fifteen-second one. update.php refuses to run if the
    # vendor on the server no longer matches composer.lock, which is the one
    # case where this bundle is not enough.
    #
    # Laid out to be extracted at the HOME directory: laravel/ and
    # public_html/ then land in the right places from one upload. It carries
    # no .env, no storage/, and no uploads/ -- nothing that holds state.

    $updateStage = Join-Path $build 'update'

    if (Test-Path $updateStage) { Remove-Item $updateStage -Recurse -Force }

    $updateApp = Join-Path $updateStage 'laravel'
    $updateWeb = Join-Path $updateStage 'public_html'

    New-Item -ItemType Directory -Path $updateApp, $updateWeb -Force | Out-Null

    foreach ($item in @('app', 'bootstrap', 'config', 'database', 'lang', 'resources', 'routes',
                        'artisan', 'composer.json', 'composer.lock', 'build.json')) {
        $source = Join-Path $appOut $item

        if (Test-Path $source) {
            Copy-Item $source -Destination $updateApp -Recurse -Force
        }
    }

    foreach ($item in @('index.html', 'assets', 'api', '.htaccess', 'update.php',
                        'favicon.ico', 'favicon.svg', 'icons.svg', 'robots.txt')) {
        $source = Join-Path $webOut $item

        if (Test-Path $source) {
            Copy-Item $source -Destination $updateWeb -Recurse -Force
        }
    }

    & php $zipper $updateStage (Join-Path $build 'update.zip') `
        'laravel/artisan' 'laravel/build.json' 'public_html/index.html' `
        'public_html/api/index.php' 'public_html/update.php'

    if ($LASTEXITCODE -ne 0) { Fail 'update.zip is incomplete.' }

    Remove-Item $updateStage -Recurse -Force
}

# --------------------------------------------------------------- summary

function Folder-Size($path) {
    $bytes = (Get-ChildItem $path -Recurse -File -Force | Measure-Object -Property Length -Sum).Sum

    if ($null -eq $bytes) { return '0 MB' }

    return ('{0:N1} MB' -f ($bytes / 1MB))
}

Step 'Done'

Write-Host ''
Write-Host "  laravel/       $(Folder-Size $appOut)   -> /home/USER/laravel"
Write-Host "  public_html/   $(Folder-Size $webOut)   -> /home/USER/public_html"

if (-not $NoZip) {
    Write-Host ''
    Write-Host '  ROUTINE UPDATE -- upload this one, extract at the HOME directory:'
    Write-Host "    $(Join-Path $build 'update.zip')"
    Write-Host '    then open  https://YOUR-DOMAIN/update.php?token=...'
    Write-Host ''
    Write-Host '  FIRST INSTALL, or when composer.lock changed:'
    Write-Host "    $(Join-Path $build 'laravel.zip')      -> extract at the home directory"
    Write-Host "    $(Join-Path $build 'public_html.zip')  -> extract inside public_html"
}

Write-Host ''
Write-Host '  Next: docs/DEPLOY.md, from step 4.' -ForegroundColor Green
Write-Host ''
