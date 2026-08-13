<?php

/**
 * Upokoron — one-click installer.
 *
 * Runs the database setup from a browser, so a cPanel plan with no Terminal
 * (and an owner who would rather not use one) still gets a correct install.
 *
 * It does exactly three things, in order: migrate, seed, cache. Nothing here
 * takes input that becomes a command; there is no arbitrary execution.
 *
 * Access is gated on INSTALL_TOKEN in .env. Migrations run as the database
 * user and the seeder creates the first owner account, so an unguarded URL
 * would be a way to hand the shop to a stranger. Rules:
 *
 *   - no INSTALL_TOKEN in .env  -> refuses to do anything
 *   - wrong token               -> refuses, and says nothing about why
 *   - finished                  -> deletes itself
 *
 * Delete this file when you are done. The button at the end does it for you.
 */

$app_root = __DIR__.'/../laravel';

if (! is_file($app_root.'/vendor/autoload.php')) {
    http_response_code(500);
    header('Content-Type: text/plain; charset=utf-8');

    exit(
        "Upokoron is not installed at the expected location.\n\n"
        ."Looked for: ".$app_root."/vendor/autoload.php\n"
        ."This file:  ".__FILE__."\n\n"
        ."The application folder should sit NEXT TO public_html, not inside it."
    );
}

require $app_root.'/vendor/autoload.php';

$app = require_once $app_root.'/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;

// Migrations on a shop with real data can take a while, and a half-run
// migration is far worse than a slow one.
@set_time_limit(300);

/**
 * Reads a value straight out of .env, deliberately not through env().
 *
 * The install run ends with `optimize`, which caches the config -- and once a
 * config cache exists Laravel stops loading the .env file entirely, so env()
 * returns null from that point on. The first version of this file used env(),
 * and the effect was that the installer locked itself out the moment it
 * succeeded: the "delete this file" button came back "Not available", leaving
 * install.php sitting on a live site with no way to remove it from the page
 * that put it there.
 */
function env_file(string $key, string $default = ''): string
{
    static $values = null;

    if ($values === null) {
        $values = [];
        $path = $GLOBALS['app_root'].'/.env';

        foreach (is_file($path) ? file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) : [] as $line) {
            $line = trim($line);

            if ($line === '' || $line[0] === '#' || ! str_contains($line, '=')) {
                continue;
            }

            [$name, $value] = explode('=', $line, 2);

            $values[trim($name)] = trim(trim($value), "\"'");
        }
    }

    return $values[$key] ?? $default;
}

$token = env_file('INSTALL_TOKEN');
$given = (string) ($_REQUEST['token'] ?? '');

$authorised = $token !== '' && hash_equals($token, $given);

/**
 * Everything the page needs to know about the current state.
 */
function environment_report(): array
{
    $report = [];

    try {
        DB::connection()->getPdo();
        $report['database'] = ['ok' => true, 'detail' => 'Connected to '.DB::connection()->getDatabaseName()];
    } catch (Throwable $e) {
        $report['database'] = ['ok' => false, 'detail' => $e->getMessage()];
    }

    $report['app_key'] = [
        'ok' => config('app.key') !== null && config('app.key') !== '',
        'detail' => config('app.key') ? 'Set' : 'MISSING — add APP_KEY to .env',
    ];

    $report['debug'] = [
        'ok' => ! config('app.debug'),
        'detail' => config('app.debug')
            ? 'APP_DEBUG is true — set it to false before going live'
            : 'Off, as it should be',
    ];

    $uploads = config('filesystems.disks.uploads.root');

    $report['uploads'] = [
        'ok' => is_dir($uploads) && is_writable($uploads),
        'detail' => is_dir($uploads)
            ? (is_writable($uploads) ? $uploads : $uploads.' — not writable, set it to 755')
            : 'Not found: '.$uploads,
    ];

    $storage = $GLOBALS['app_root'].'/storage';

    $report['storage'] = [
        'ok' => is_writable($storage.'/logs') && is_writable($storage.'/framework'),
        'detail' => is_writable($storage.'/logs') ? 'Writable' : $storage.' — not writable, set it to 755',
    ];

    try {
        $report['tables'] = [
            'ok' => true,
            'detail' => count(DB::select('SHOW TABLES')).' tables',
        ];
    } catch (Throwable $e) {
        $report['tables'] = ['ok' => false, 'detail' => 'Could not read the database'];
    }

    return $report;
}

$report = $authorised ? environment_report() : [];
$blocked = false;

foreach ($report as $key => $row) {
    // Uploads and debug are warnings; the rest must pass before anything runs.
    if (! $row['ok'] && ! in_array($key, ['uploads', 'debug', 'tables'], true)) {
        $blocked = true;
    }
}

$output = null;
$failed = false;

if ($authorised && ! $blocked && ($_POST['action'] ?? '') === 'install') {
    $lines = [];

    // Order matters: the schema has to exist before the seeder writes to it,
    // and config is cached last so it captures the finished state.
    $steps = [
        'migrate' => ['--force' => true],
        'db:seed' => ['--force' => true],
        'optimize' => [],
    ];

    foreach ($steps as $command => $arguments) {
        $lines[] = '$ php artisan '.$command;

        try {
            $status = Artisan::call($command, $arguments);
            $lines[] = trim(Artisan::output());

            if ($status !== 0) {
                $failed = true;
                $lines[] = '!! '.$command.' exited with status '.$status;

                break;
            }
        } catch (Throwable $e) {
            $failed = true;
            $lines[] = '!! '.$e->getMessage();

            break;
        }

        $lines[] = '';
    }

    if (! $failed) {
        // Prove it rather than claim it: the same invariants the nightly
        // check runs. If the books do not balance on a fresh install,
        // something is wrong that a green "done" would hide.
        $lines[] = '$ php artisan accounting:check';

        try {
            Artisan::call('accounting:check');
            $lines[] = trim(Artisan::output());
        } catch (Throwable $e) {
            $lines[] = 'Could not run the integrity check: '.$e->getMessage();
        }
    }

    $output = implode("\n", $lines);
}

if ($authorised && ($_POST['action'] ?? '') === 'delete') {
    @unlink(__FILE__);

    header('Content-Type: text/html; charset=utf-8');

    exit('<!doctype html><meta charset="utf-8"><body style="font:16px system-ui;padding:40px">'
        .'<h1>Deleted.</h1><p>install.php has removed itself. Your shop is at '
        .'<a href="/">the home page</a>.</p>');
}

$ownerEmail = env_file('OWNER_EMAIL');
?>
<!doctype html>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Install Upokoron</title>
<style>
  :root { --bg:#f6f8fb; --card:#fff; --ink:#0f172a; --muted:#64748b; --line:#e2e8f0;
          --ok:#0f8a4c; --warn:#b45309; --bad:#c2261a; --brand:#1e4be0; }
  * { box-sizing:border-box; }
  body { margin:0; padding:32px 16px 64px; background:var(--bg); color:var(--ink);
         font:15px/1.6 system-ui, -apple-system, "Segoe UI", sans-serif; }
  .wrap { max-width:760px; margin:0 auto; }
  h1 { font-size:26px; margin:0 0 6px; }
  .sub { color:var(--muted); margin:0 0 28px; }
  .card { background:var(--card); border:1px solid var(--line); border-radius:12px;
          padding:20px; margin-bottom:18px; }
  .row { display:flex; gap:12px; padding:9px 0; border-bottom:1px solid #f1f5f9; }
  .row:last-child { border-bottom:0; }
  .tag { flex:none; width:46px; height:22px; text-align:center; font-size:11px; font-weight:700;
         border-radius:4px; text-transform:uppercase; line-height:22px; }
  .ok  { background:#e7f6ee; color:var(--ok); }
  .bad { background:#fdeceb; color:var(--bad); }
  .warn{ background:#fef4e6; color:var(--warn); }
  .k { flex:none; width:130px; font-weight:600; }
  .v { flex:1; min-width:0; word-break:break-word; color:var(--muted); }
  button { background:var(--brand); color:#fff; border:0; border-radius:8px; padding:13px 26px;
           font:600 16px system-ui; cursor:pointer; }
  button:disabled { background:#94a3b8; cursor:not-allowed; }
  button.ghost { background:#fff; color:var(--bad); border:1px solid var(--line); }
  pre { background:#0f172a; color:#e2e8f0; padding:16px; border-radius:8px; overflow-x:auto;
        font:13px/1.5 ui-monospace, Consolas, monospace; white-space:pre-wrap; }
  .banner { padding:16px 18px; border-radius:10px; margin-bottom:22px; font-weight:600; }
  .banner.good { background:#e7f6ee; color:var(--ok); border:1px solid #bfe6d0; }
  .banner.bad  { background:#fdeceb; color:var(--bad); border:1px solid #f5c8c4; }
  .banner p { font-weight:400; color:var(--ink); margin:8px 0 0; }
  code { background:#eef2f7; padding:2px 6px; border-radius:4px; font-size:13.5px; }
</style>

<div class="wrap">
<?php if (! $authorised): ?>

  <h1>Not available</h1>
  <p class="sub">
    <?php if ($token === ''): ?>
      This installer is switched off. Add <code>INSTALL_TOKEN</code> to
      <code>.env</code> with a long random value, then open this page with
      <code>?token=</code> followed by that value.
    <?php else: ?>
      Add <code>?token=</code> and your install token to the address.
    <?php endif; ?>
  </p>

<?php elseif ($output !== null): ?>

  <?php if ($failed): ?>
    <div class="banner bad">
      Setup did not finish.
      <p>The output below says why. The usual causes are database privileges
      (the user needs ALL PRIVILEGES) and a missing <code>OWNER_PASSWORD</code>
      in <code>.env</code> — the seeder refuses to create an owner account
      without one, on purpose. Fix it and run this page again; migrations that
      already ran are skipped.</p>
    </div>
  <?php else: ?>
    <div class="banner good">
      Upokoron is installed.
      <p>Sign in at <a href="/login">/login</a><?php if ($ownerEmail !== ''): ?>
      as <strong><?= htmlspecialchars($ownerEmail) ?></strong><?php endif; ?>,
      using the password you put in <code>OWNER_PASSWORD</code>. Change it, then
      blank that line out of <code>.env</code>.</p>
      <p>One thing to know: your settings are cached for speed now, so editing
      <code>.env</code> later has no effect on its own. After any change run
      <code>php artisan optimize</code> once — a temporary cron job does that
      if you have no Terminal.</p>
    </div>
  <?php endif; ?>

  <div class="card">
    <pre><?= htmlspecialchars($output) ?></pre>
  </div>

  <div class="card">
    <h2 style="margin:0 0 6px;font-size:17px">Last step: delete this file</h2>
    <p style="margin:0 0 14px;color:var(--muted)">
      It can run migrations and create accounts. It should not stay on a live site.
    </p>
    <form method="post">
      <input type="hidden" name="token" value="<?= htmlspecialchars($given) ?>">
      <button class="ghost" name="action" value="delete" type="submit">Delete install.php</button>
    </form>
  </div>

<?php else: ?>

  <h1>Install Upokoron</h1>
  <p class="sub">This creates the database tables and your owner account. It takes about a minute.</p>

  <div class="card">
    <?php foreach ($report as $key => $row): ?>
      <div class="row">
        <span class="tag <?= $row['ok'] ? 'ok' : (in_array($key, ['uploads', 'debug', 'tables'], true) ? 'warn' : 'bad') ?>">
          <?= $row['ok'] ? 'ok' : (in_array($key, ['uploads', 'debug', 'tables'], true) ? 'warn' : 'fail') ?>
        </span>
        <span class="k"><?= htmlspecialchars(ucfirst(str_replace('_', ' ', $key))) ?></span>
        <span class="v"><?= htmlspecialchars($row['detail']) ?></span>
      </div>
    <?php endforeach; ?>
  </div>

  <?php if ($blocked): ?>
    <div class="banner bad">
      Fix the items marked FAIL first.
      <p>Nothing has been changed. Correct <code>.env</code> or the folder
      permissions, then reload this page.</p>
    </div>
  <?php endif; ?>

  <form method="post">
    <input type="hidden" name="token" value="<?= htmlspecialchars($given) ?>">
    <button name="action" value="install" type="submit" <?= $blocked ? 'disabled' : '' ?>>
      Install now
    </button>
  </form>

<?php endif; ?>
</div>
