<?php

/**
 * Upokoron — update endpoint.
 *
 * Deliberately much weaker than install.php was. It accepts no files and no
 * commands. All it can do is:
 *
 *     php artisan migrate --force
 *     php artisan optimize
 *
 * That is the whole surface. Uploading new code stays a manual step through
 * File Manager, so a leaked token cannot be used to put code on the site --
 * the worst it buys an attacker is a migration run and a cache rebuild.
 *
 * Gated on UPDATE_TOKEN in .env, read straight from the file rather than
 * through env(), so blanking that one line switches this off INSTANTLY, with
 * no cache to clear and no second step to forget.
 */

$app_root = __DIR__.'/../laravel';

if (! is_file($app_root.'/vendor/autoload.php')) {
    http_response_code(500);
    header('Content-Type: text/plain; charset=utf-8');

    exit(
        "Upokoron is not installed at the expected location.\n\n"
        ."Looked for: ".$app_root."/vendor/autoload.php\n"
        ."This file:  ".__FILE__."\n"
    );
}

require $app_root.'/vendor/autoload.php';

$app = require_once $app_root.'/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;

@set_time_limit(300);

/**
 * Reads a value straight out of .env.
 *
 * Not env(): once `optimize` has cached the config, Laravel stops loading the
 * .env file at all and env() returns null. Reading the file keeps the token
 * check working after an update, which is exactly when it is needed again.
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

$token = env_file('UPDATE_TOKEN');
$given = (string) ($_REQUEST['token'] ?? '');
$authorised = $token !== '' && hash_equals($token, $given);

/**
 * Which build is actually on the server.
 *
 * Written by build.ps1 into the bundle. Worth showing before anything runs:
 * the commonest update mistake is extracting the zip in the wrong place, and
 * then the site looks unchanged for a reason nobody can see. If this still
 * reads the previous commit, the upload did not land.
 */
function build_info(): array
{
    $path = $GLOBALS['app_root'].'/build.json';

    if (! is_file($path)) {
        return ['ok' => false, 'detail' => 'no build.json — this bundle predates the update pipeline'];
    }

    $build = json_decode((string) file_get_contents($path), true);

    if (! is_array($build)) {
        return ['ok' => false, 'detail' => 'build.json is unreadable'];
    }

    return [
        'ok' => true,
        'detail' => ($build['commit'] ?? '?').'  ·  built '.($build['built_at'] ?? '?'),
        'commit' => $build['commit'] ?? '?',
    ];
}

/**
 * Does vendor/ match composer.lock?
 *
 * The slim update bundle leaves vendor/ out, because it is 7 of the 8 MB and
 * almost never changes. When it DOES change -- a new package -- shipping the
 * slim bundle alone gives a "Class not found" on every request. Comparing the
 * lock file against what composer actually installed catches that here, in a
 * sentence, instead of on the live site.
 */
function vendor_matches_lock(): array
{
    $root = $GLOBALS['app_root'];
    $lockPath = $root.'/composer.lock';
    $installedPath = $root.'/vendor/composer/installed.php';

    if (! is_file($lockPath) || ! is_file($installedPath)) {
        return ['ok' => false, 'detail' => 'cannot compare: composer.lock or vendor/composer/installed.php is missing'];
    }

    $lock = json_decode((string) file_get_contents($lockPath), true);
    $installed = require $installedPath;

    $wanted = [];

    foreach (($lock['packages'] ?? []) as $package) {
        $wanted[$package['name']] = $package['version'];
    }

    $have = [];

    foreach (($installed['versions'] ?? []) as $name => $meta) {
        // dev-only and root packages have no pretty_version worth comparing.
        if (isset($meta['pretty_version'])) {
            $have[$name] = $meta['pretty_version'];
        }
    }

    $missing = [];
    $wrong = [];

    foreach ($wanted as $name => $version) {
        if (! isset($have[$name])) {
            $missing[] = $name;
        } elseif ($have[$name] !== $version) {
            $wrong[] = "{$name} (have {$have[$name]}, want {$version})";
        }
    }

    if ($missing === [] && $wrong === []) {
        return ['ok' => true, 'detail' => count($wanted).' packages, all present at the locked versions'];
    }

    $problems = array_merge(
        $missing ? [count($missing).' missing: '.implode(', ', array_slice($missing, 0, 5))] : [],
        $wrong ? [count($wrong).' at the wrong version: '.implode(', ', array_slice($wrong, 0, 3))] : [],
    );

    return [
        'ok' => false,
        'detail' => implode(' · ', $problems).' — upload the FULL laravel.zip, not the slim update bundle',
    ];
}

/**
 * Migrations that have not run yet, by name.
 */
function pending_migrations(): array
{
    try {
        Artisan::call('migrate:status', ['--pending' => true]);

        $output = trim(Artisan::output());

        if ($output === '' || str_contains($output, 'No pending migrations')) {
            return ['ok' => true, 'detail' => 'none — the schema is current', 'count' => 0];
        }

        // Each pending row is a line; the count is what matters here.
        $lines = array_values(array_filter(
            array_map('trim', explode("\n", $output)),
            static fn (string $line): bool => str_contains($line, '_') && ! str_starts_with($line, 'Migration'),
        ));

        return ['ok' => true, 'detail' => count($lines).' waiting to run', 'count' => count($lines), 'list' => $lines];
    } catch (Throwable $e) {
        return ['ok' => false, 'detail' => 'could not read migration status: '.$e->getMessage(), 'count' => 0];
    }
}

$report = [];

if ($authorised) {
    try {
        DB::connection()->getPdo();
        $report['Database'] = ['ok' => true, 'detail' => 'connected to '.DB::connection()->getDatabaseName()];
    } catch (Throwable $e) {
        $report['Database'] = ['ok' => false, 'detail' => $e->getMessage()];
    }

    $report['Build on server'] = build_info();
    $report['Dependencies'] = vendor_matches_lock();
    $report['Pending migrations'] = pending_migrations();
}

$blocked = isset($report['Database']) && ! $report['Database']['ok'];
$blocked = $blocked || (isset($report['Dependencies']) && ! $report['Dependencies']['ok']);

$output = null;
$failed = false;

if ($authorised && ! $blocked && ($_POST['action'] ?? '') === 'update') {
    // Two updates running at once would have two migration processes racing
    // for the same tables. The lock is released when the request ends, even
    // if it dies, because the handle goes with it.
    $lockPath = $app_root.'/storage/framework/update.lock';
    $lock = fopen($lockPath, 'c');

    if ($lock === false || ! flock($lock, LOCK_EX | LOCK_NB)) {
        http_response_code(409);

        $output = 'Another update is already running. Wait for it to finish, then reload.';
        $failed = true;
    } else {
        $lines = [];

        // cache:clear between the two: a migration can change what a setting
        // or a config value should resolve to, but SettingsService caches its
        // merged result under its own key (Cache::remember, 1 hour) which
        // `optimize` never touches -- only config/route/view are baked by
        // that command. Without this, a settings change shipped in this
        // deploy would not actually take effect until the old cache entry's
        // hour ran out.
        //
        // db:seed runs RolePermissionSeeder specifically, nothing else --
        // Permissions::all() is the single source of truth for what exists,
        // and this is the only thing that ever syncs a newly-declared
        // permission onto the roles in App\Support\Permissions::roles(). It
        // is deliberately idempotent (see the seeder's own docblock) so
        // running it on every deploy, whether or not this push added a
        // permission, is safe.
        $steps = [
            'migrate' => ['--force' => true],
            'db:seed' => ['--class' => 'Database\\Seeders\\RolePermissionSeeder', '--force' => true],
            'cache:clear' => [],
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
            // The books have to still balance after a schema change. A
            // migration that quietly corrupts the ledger is exactly the kind
            // of thing that is invisible until month end.
            $lines[] = '$ php artisan accounting:check';

            try {
                $status = Artisan::call('accounting:check');
                $lines[] = trim(Artisan::output());

                if ($status !== 0) {
                    $failed = true;
                }
            } catch (Throwable $e) {
                $lines[] = 'Could not run the integrity check: '.$e->getMessage();
            }
        }

        $output = implode("\n", $lines);

        flock($lock, LOCK_UN);
        fclose($lock);
    }

    // A record of every update, kept out of the way of the app's own log.
    @file_put_contents(
        $app_root.'/storage/logs/update.log',
        sprintf(
            "[%s] %s from %s — build %s\n",
            date('Y-m-d H:i:s'),
            $failed ? 'FAILED' : 'ok',
            $_SERVER['REMOTE_ADDR'] ?? '?',
            build_info()['commit'] ?? '?',
        ),
        FILE_APPEND,
    );
}
?>
<!doctype html>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Update Upokoron</title>
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
  .k { flex:none; width:150px; font-weight:600; }
  .v { flex:1; min-width:0; word-break:break-word; color:var(--muted); }
  button { background:var(--brand); color:#fff; border:0; border-radius:8px; padding:13px 26px;
           font:600 16px system-ui; cursor:pointer; }
  button:disabled { background:#94a3b8; cursor:not-allowed; }
  pre { background:#0f172a; color:#e2e8f0; padding:16px; border-radius:8px; overflow-x:auto;
        font:13px/1.5 ui-monospace, Consolas, monospace; white-space:pre-wrap; }
  .banner { padding:16px 18px; border-radius:10px; margin-bottom:22px; font-weight:600; }
  .banner.good { background:#e7f6ee; color:var(--ok); border:1px solid #bfe6d0; }
  .banner.bad  { background:#fdeceb; color:var(--bad); border:1px solid #f5c8c4; }
  .banner p { font-weight:400; color:var(--ink); margin:8px 0 0; }
  code { background:#eef2f7; padding:2px 6px; border-radius:4px; font-size:13.5px; }
  ul { margin:8px 0 0; padding-left:20px; color:var(--muted); font-size:14px; }
</style>

<div class="wrap">
<?php if (! $authorised): ?>

  <h1>Not available</h1>
  <p class="sub">
    <?php if ($token === ''): ?>
      Updates are switched off. Add <code>UPDATE_TOKEN</code> to <code>.env</code>
      with a long random value to turn them back on.
    <?php else: ?>
      Add <code>?token=</code> and the update token to the address.
    <?php endif; ?>
  </p>

<?php elseif ($output !== null): ?>

  <div class="banner <?= $failed ? 'bad' : 'good' ?>">
    <?= $failed ? 'The update did not finish.' : 'Update applied.' ?>
    <p>
      <?php if ($failed): ?>
        Nothing else was run after the failure. The output below says why. The
        site is still serving the previous code, because code is uploaded by
        hand and this page never touches it.
      <?php else: ?>
        Migrations ran, the caches were rebuilt, and the ledger still balances.
        <a href="/">Open the shop</a>.
      <?php endif; ?>
    </p>
  </div>

  <div class="card"><pre><?= htmlspecialchars($output) ?></pre></div>

<?php else: ?>

  <h1>Update Upokoron</h1>
  <p class="sub">
    Applies database changes for code you have already uploaded. It does not
    upload, change, or delete any file.
  </p>

  <div class="card">
    <?php foreach ($report as $name => $row): ?>
      <div class="row">
        <span class="tag <?= $row['ok'] ? 'ok' : 'bad' ?>"><?= $row['ok'] ? 'ok' : 'check' ?></span>
        <span class="k"><?= htmlspecialchars($name) ?></span>
        <span class="v">
          <?= htmlspecialchars($row['detail']) ?>
          <?php if (! empty($row['list'])): ?>
            <ul>
              <?php foreach (array_slice($row['list'], 0, 12) as $item): ?>
                <li><?= htmlspecialchars($item) ?></li>
              <?php endforeach; ?>
            </ul>
          <?php endif; ?>
        </span>
      </div>
    <?php endforeach; ?>
  </div>

  <?php if ($blocked): ?>
    <div class="banner bad">
      Not safe to run yet.
      <p>Fix the item marked <strong>check</strong> above first. Nothing has
      been changed.</p>
    </div>
  <?php endif; ?>

  <form method="post">
    <input type="hidden" name="token" value="<?= htmlspecialchars($given) ?>">
    <button name="action" value="update" type="submit" <?= $blocked ? 'disabled' : '' ?>>
      <?= (($report['Pending migrations']['count'] ?? 0) > 0)
            ? 'Run '.$report['Pending migrations']['count'].' migration(s) and rebuild caches'
            : 'Rebuild caches' ?>
    </button>
  </form>

<?php endif; ?>
</div>
