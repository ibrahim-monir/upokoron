<?php
/**
 * Upokoron — cPanel preflight check.
 *
 * Upload THIS ONE FILE to public_html/ and open it in a browser BEFORE
 * uploading anything else. It answers one question: will this hosting
 * account actually run the application?
 *
 * Deliberately written in old PHP syntax (5.4-compatible, no type hints, no
 * ?? operator, no ::class) so that on a host running PHP 7.4 it still loads
 * and REPORTS "your PHP is too old" instead of dying with a parse error and
 * showing a blank white page -- which would tell you nothing.
 *
 * DELETE IT when you are done. It reports server details that are nobody
 * else's business. There is a delete button at the bottom.
 */

// ---------------------------------------------------------------- helpers

$results = array();

function check($group, $name, $status, $detail, $fix)
{
    global $results;

    $results[] = array(
        'group'  => $group,
        'name'   => $name,
        'status' => $status, // pass | warn | fail
        'detail' => $detail,
        'fix'    => $fix,
    );
}

function bytes_from_ini($value)
{
    $value = trim($value);

    if ($value === '') {
        return 0;
    }

    $unit = strtolower(substr($value, -1));
    $number = (float) $value;

    if ($unit === 'g') return $number * 1024 * 1024 * 1024;
    if ($unit === 'm') return $number * 1024 * 1024;
    if ($unit === 'k') return $number * 1024;

    return $number;
}

function human_bytes($bytes)
{
    if ($bytes >= 1073741824) return round($bytes / 1073741824, 1) . ' GB';
    if ($bytes >= 1048576)    return round($bytes / 1048576, 1) . ' MB';
    if ($bytes >= 1024)       return round($bytes / 1024, 1) . ' KB';

    return $bytes . ' B';
}

// ------------------------------------------------------------------- PHP

$phpVersion = PHP_VERSION;

if (version_compare($phpVersion, '8.3.0', '>=')) {
    check('PHP', 'PHP version', 'pass', $phpVersion, '');
} elseif (version_compare($phpVersion, '8.0.0', '>=')) {
    check('PHP', 'PHP version', 'fail', $phpVersion . ' — Laravel 13 needs 8.3 or newer',
        'cPanel → MultiPHP Manager → select this domain → set PHP 8.3 or 8.4 → Apply. '
        . 'If 8.3 is not in the list, the host must add it; ask support.');
} else {
    check('PHP', 'PHP version', 'fail', $phpVersion . ' — far too old',
        'cPanel → MultiPHP Manager → set PHP 8.3+. If the host cannot offer 8.3, '
        . 'this hosting account cannot run the application at all.');
}

// 64-bit matters: money is handled as strings via bcmath, but timestamps and
// row ids on a 32-bit build overflow in ways that are painful to debug.
check('PHP', 'Architecture', PHP_INT_SIZE >= 8 ? 'pass' : 'warn',
    (PHP_INT_SIZE * 8) . '-bit',
    PHP_INT_SIZE >= 8 ? '' : 'A 32-bit PHP build is unusual on modern cPanel. Ask the host for 64-bit.');

// Extensions. bcmath is the one people do not expect: every price, cost, and
// ledger amount is computed with it. Without bcmath nothing financial runs.
$required = array(
    'bcmath'    => 'Money and inventory arithmetic. Every price, COGS figure, and journal amount goes through it.',
    'pdo_mysql' => 'Talking to MySQL.',
    'mbstring'  => 'Multi-byte strings (Bangla text, ৳ symbol).',
    'openssl'   => 'APP_KEY encryption, HTTPS requests, hashing.',
    'tokenizer' => 'Laravel internals.',
    'xml'       => 'Laravel internals.',
    'ctype'     => 'Laravel internals.',
    'json'      => 'API responses.',
    'fileinfo'  => 'Reading a real MIME type out of an uploaded file’s bytes.',
    'curl'      => 'Outgoing HTTP (SMS, payment gateways later).',
    'zip'       => 'Composer, and unzipping the deployment bundle.',
    'session'   => 'Sanctum session authentication.',
);

foreach ($required as $ext => $why) {
    $loaded = extension_loaded($ext);

    check('PHP extensions', $ext, $loaded ? 'pass' : 'fail',
        $loaded ? 'loaded — ' . $why : 'MISSING — ' . $why,
        $loaded ? '' : 'cPanel → Select PHP Version → Extensions → tick "' . $ext . '" → Save.');
}

$optional = array(
    'gd'       => 'Only needed if image resizing is added later. Uploads work without it.',
    'imagick'  => 'Alternative to gd. Also optional.',
    'redis'    => 'Optional cache/queue driver. The app runs fine on the database driver.',
    'intl'     => 'Nicer number and date formatting. Not required.',
    'exif'     => 'Reads photo orientation. Not required.',
    'opcache'  => 'Big speed win. Strongly recommended, not required.',
);

foreach ($optional as $ext => $why) {
    $loaded = extension_loaded($ext);

    check('Optional extensions', $ext, $loaded ? 'pass' : 'warn',
        ($loaded ? 'loaded' : 'not loaded') . ' — ' . $why, '');
}

// ------------------------------------------------------- PHP ini settings

$memory = bytes_from_ini(ini_get('memory_limit'));

if ($memory === 0.0 || $memory < 0) {
    check('PHP settings', 'memory_limit', 'pass', 'unlimited', '');
} elseif ($memory >= 256 * 1048576) {
    check('PHP settings', 'memory_limit', 'pass', ini_get('memory_limit'), '');
} elseif ($memory >= 128 * 1048576) {
    check('PHP settings', 'memory_limit', 'warn', ini_get('memory_limit') . ' — enough to serve, tight for composer',
        'Raise to 256M in cPanel → Select PHP Version → Options.');
} else {
    check('PHP settings', 'memory_limit', 'fail', ini_get('memory_limit') . ' — too low',
        'cPanel → Select PHP Version → Options → memory_limit = 256M.');
}

$upload = bytes_from_ini(ini_get('upload_max_filesize'));
$post   = bytes_from_ini(ini_get('post_max_size'));

// Product images are capped at 5 MB by the application, and several can be
// sent at once, so post_max_size is the one that actually bites.
check('PHP settings', 'upload_max_filesize',
    $upload >= 8 * 1048576 ? 'pass' : 'warn',
    ini_get('upload_max_filesize') . ' (app allows 5 MB per image)',
    $upload >= 8 * 1048576 ? '' : 'Raise to 16M so a 5 MB image plus overhead fits.');

check('PHP settings', 'post_max_size',
    $post >= 32 * 1048576 ? 'pass' : 'warn',
    ini_get('post_max_size') . ' (limits how many images upload at once)',
    $post >= 32 * 1048576 ? '' : 'Raise to 64M in cPanel → Select PHP Version → Options.');

check('PHP settings', 'max_execution_time',
    ((int) ini_get('max_execution_time') >= 60 || (int) ini_get('max_execution_time') === 0) ? 'pass' : 'warn',
    ini_get('max_execution_time') . 's',
    'Migrations and report queries want at least 60s. Raise it if a deploy step times out.');

// ------------------------------------------------------------ filesystem

$docRoot = isset($_SERVER['DOCUMENT_ROOT']) ? $_SERVER['DOCUMENT_ROOT'] : dirname(__FILE__);
$home    = dirname($docRoot);

check('Paths', 'Document root', 'pass', $docRoot,
    'The React build goes here.');

check('Paths', 'Home directory', is_dir($home) ? 'pass' : 'warn', $home,
    'The Laravel application goes in ' . $home . '/laravel — one level ABOVE the document root, '
    . 'so .env and the source code are never reachable over the web.');

// Can we create the sibling directory the deployment plan needs?
$probe = $home . '/.upokoron-write-probe';
$canWriteHome = @mkdir($probe);

if ($canWriteHome) {
    @rmdir($probe);
    check('Paths', 'Home directory is writable', 'pass', 'yes — /laravel can be created here', '');
} else {
    check('Paths', 'Home directory is writable', 'warn', 'could not create a test directory',
        'Not fatal: PHP often cannot write outside the document root even where File Manager can. '
        . 'Create the folder with cPanel File Manager instead.');
}

$probeFile = $docRoot . '/.upokoron-write-probe';
$canWriteDocRoot = @file_put_contents($probeFile, 'x') !== false;

if ($canWriteDocRoot) {
    @unlink($probeFile);
    check('Paths', 'Document root is writable by PHP', 'pass', 'yes — product image uploads will work', '');
} else {
    check('Paths', 'Document root is writable by PHP', 'fail', 'no',
        'Product images are written into public_html/uploads. Set that folder to 0755 and make sure '
        . 'it is owned by your cPanel user.');
}

// symlink() is the classic cPanel casualty. The app is built not to need it,
// which is worth confirming rather than assuming.
$symlinkAvailable = function_exists('symlink') && ! in_array('symlink', array_map('trim', explode(',', ini_get('disable_functions'))));

check('Paths', 'symlink() available', $symlinkAvailable ? 'pass' : 'warn',
    $symlinkAvailable ? 'yes' : 'disabled by the host',
    $symlinkAvailable
        ? ''
        : 'Not a problem. This app deliberately does NOT use "php artisan storage:link" — uploads are '
          . 'written straight into public_html/uploads instead, precisely because shared hosts disable this.');

// ---------------------------------------------------------------- Apache

$rewrite = 'unknown';

if (function_exists('apache_get_modules')) {
    $rewrite = in_array('mod_rewrite', apache_get_modules()) ? 'yes' : 'no';
}

if ($rewrite === 'yes') {
    check('Web server', 'mod_rewrite', 'pass', 'enabled', '');
} elseif ($rewrite === 'no') {
    check('Web server', 'mod_rewrite', 'fail', 'NOT enabled',
        'Laravel routing and the React SPA both need it. Ask the host to enable mod_rewrite.');
} else {
    // Under PHP-FPM, apache_get_modules() does not exist. Test it for real.
    check('Web server', 'mod_rewrite', 'warn', 'cannot detect from PHP (normal under PHP-FPM)',
        'Verify by hand: the rewrite test link at the bottom of this page must load.');
}

check('Web server', 'Server software', 'pass',
    isset($_SERVER['SERVER_SOFTWARE']) ? $_SERVER['SERVER_SOFTWARE'] : 'unknown', '');

check('Web server', 'HTTPS',
    (! empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'pass' : 'warn',
    (! empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'this page loaded over HTTPS' : 'this page loaded over plain HTTP',
    'Sanctum login cookies are marked Secure in production. Issue the free AutoSSL certificate '
    . '(cPanel → SSL/TLS Status → Run AutoSSL) BEFORE going live, or nobody can log in.');

// ----------------------------------------------------------- shell / cron

$disabled = array_map('trim', explode(',', ini_get('disable_functions')));

foreach (array('exec', 'shell_exec', 'proc_open', 'symlink') as $fn) {
    // Reported for information; the deployment does not depend on any of them.
    $available = function_exists($fn) && ! in_array($fn, $disabled);

    if ($fn === 'symlink') continue; // already reported above

    check('Shell access', $fn . '()', $available ? 'pass' : 'warn',
        $available ? 'available' : 'disabled',
        $available ? '' : 'Only matters if you have no cPanel Terminal. See the note under the results.');
}

check('Shell access', 'Terminal / SSH', 'warn', 'cannot be detected from PHP',
    'Look in cPanel for a "Terminal" icon. If it is there, deployment is straightforward. '
    . 'If it is NOT there, you can still deploy — see DEPLOY.md, "No Terminal" section.');

// --------------------------------------------------------------- MySQL

$dbTested = false;
$dbHost = isset($_POST['db_host']) ? $_POST['db_host'] : 'localhost';
$dbName = isset($_POST['db_name']) ? $_POST['db_name'] : '';
$dbUser = isset($_POST['db_user']) ? $_POST['db_user'] : '';
$dbPass = isset($_POST['db_pass']) ? $_POST['db_pass'] : '';

if ($dbName !== '' && $dbUser !== '') {
    $dbTested = true;

    try {
        $pdo = new PDO('mysql:host=' . $dbHost . ';dbname=' . $dbName, $dbUser, $dbPass,
            array(PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_TIMEOUT => 5));

        check('Database', 'Connection', 'pass', 'connected to ' . $dbName . ' as ' . $dbUser, '');

        $version = $pdo->query('SELECT VERSION()')->fetchColumn();
        $isMaria = stripos($version, 'maria') !== false;

        // The schema uses CHECK constraints, STORED generated columns, and a
        // recursive CTE for the category tree. MySQL only got CHECK in
        // 8.0.16 -- older versions PARSE it and silently ignore it, which is
        // worse than failing, because the guard rails would look present and
        // do nothing.
        if ($isMaria) {
            preg_match('/(\d+\.\d+\.\d+)/', $version, $m);
            $mv = isset($m[1]) ? $m[1] : '0';

            check('Database', 'Version', version_compare($mv, '10.3.0', '>=') ? 'pass' : 'fail',
                $version,
                version_compare($mv, '10.3.0', '>=') ? ''
                    : 'MariaDB 10.3+ is required for CHECK constraints and recursive queries.');
        } else {
            preg_match('/(\d+\.\d+\.\d+)/', $version, $m);
            $mv = isset($m[1]) ? $m[1] : '0';

            if (version_compare($mv, '8.0.16', '>=')) {
                check('Database', 'Version', 'pass', $version, '');
            } else {
                check('Database', 'Version', 'fail', $version . ' — CHECK constraints are ignored before 8.0.16',
                    'Ask the host for MySQL 8.0.16+ or MariaDB 10.3+. On an older server the database '
                    . 'would accept negative stock and unbalanced journal entries without complaining.');
            }
        }

        // InnoDB or nothing: every stock movement and journal entry is written
        // inside a transaction with row locks.
        $engines = $pdo->query("SHOW ENGINES")->fetchAll(PDO::FETCH_ASSOC);
        $innodb = 'missing';

        foreach ($engines as $engine) {
            if (strtolower($engine['Engine']) === 'innodb') {
                $innodb = $engine['Support'];
            }
        }

        check('Database', 'InnoDB engine',
            in_array(strtoupper($innodb), array('YES', 'DEFAULT')) ? 'pass' : 'fail',
            $innodb,
            'InnoDB is required: transactions and row locking are what keep stock and the ledger correct '
            . 'when two orders land at the same moment.');

        // A test CHECK constraint proves enforcement rather than parsing.
        try {
            $pdo->exec('DROP TABLE IF EXISTS upokoron_preflight_probe');
            $pdo->exec('CREATE TABLE upokoron_preflight_probe (n INT, CONSTRAINT chk_probe CHECK (n > 0)) ENGINE=InnoDB');

            $enforced = false;

            try {
                $pdo->exec('INSERT INTO upokoron_preflight_probe (n) VALUES (-1)');
            } catch (Exception $e) {
                $enforced = true;
            }

            $pdo->exec('DROP TABLE IF EXISTS upokoron_preflight_probe');

            check('Database', 'CHECK constraints enforced', $enforced ? 'pass' : 'fail',
                $enforced ? 'yes — a negative value was rejected' : 'NO — a negative value was accepted',
                $enforced ? '' : 'The database would not stop negative stock. Upgrade the server before going live.');
        } catch (Exception $e) {
            check('Database', 'CHECK constraints enforced', 'warn',
                'could not test: ' . $e->getMessage(),
                'The database user may lack CREATE TABLE rights. Grant ALL PRIVILEGES on the database.');
        }

        // Privileges: migrations create, alter, and drop.
        try {
            $grants = $pdo->query('SHOW GRANTS')->fetchAll(PDO::FETCH_COLUMN);
            $all = false;

            foreach ($grants as $grant) {
                if (stripos($grant, 'ALL PRIVILEGES') !== false) $all = true;
            }

            check('Database', 'Privileges', $all ? 'pass' : 'warn',
                $all ? 'ALL PRIVILEGES' : implode(' | ', $grants),
                $all ? '' : 'Migrations need CREATE, ALTER, DROP, INDEX and REFERENCES. In cPanel → '
                    . 'MySQL Databases → Add User To Database → tick ALL PRIVILEGES.');
        } catch (Exception $e) {
            check('Database', 'Privileges', 'warn', 'could not read grants', '');
        }
    } catch (Exception $e) {
        check('Database', 'Connection', 'fail', $e->getMessage(),
            'Create the database and user in cPanel → MySQL Databases, then add the user to the database '
            . 'with ALL PRIVILEGES. Remember cPanel prefixes both names with your account name.');
    }
}

// ------------------------------------------------------------- verdict

$fails = 0;
$warns = 0;

foreach ($results as $r) {
    if ($r['status'] === 'fail') $fails++;
    if ($r['status'] === 'warn') $warns++;
}

// ------------------------------------------------------- self-destruct

if (isset($_POST['delete_self'])) {
    @unlink(__FILE__);

    echo '<!doctype html><meta charset="utf-8">'
       . '<body style="font:16px system-ui;padding:40px">'
       . '<h1>Deleted.</h1><p>preflight.php has removed itself. Reload to confirm you get a 404.</p>';
    exit;
}

$groups = array();

foreach ($results as $r) {
    $groups[$r['group']][] = $r;
}
?>
<!doctype html>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Upokoron — hosting preflight</title>
<style>
  :root { --bg:#f6f8fb; --card:#fff; --ink:#0f172a; --muted:#64748b; --line:#e2e8f0;
          --pass:#0f8a4c; --warn:#b45309; --fail:#c2261a; --brand:#1e4be0; }
  * { box-sizing: border-box; }
  body { margin:0; padding:24px 16px 64px; background:var(--bg); color:var(--ink);
         font:15px/1.55 system-ui, -apple-system, "Segoe UI", sans-serif; }
  .wrap { max-width: 860px; margin: 0 auto; }
  h1 { font-size:24px; margin:0 0 4px; }
  .sub { color:var(--muted); margin:0 0 24px; }
  .verdict { padding:16px 18px; border-radius:10px; margin-bottom:24px; font-weight:600; }
  .verdict.ok   { background:#e7f6ee; color:var(--pass); border:1px solid #bfe6d0; }
  .verdict.warn { background:#fef4e6; color:var(--warn); border:1px solid #f3ddb5; }
  .verdict.bad  { background:#fdeceb; color:var(--fail); border:1px solid #f5c8c4; }
  .verdict p { font-weight:400; color:var(--ink); margin:8px 0 0; }
  .card { background:var(--card); border:1px solid var(--line); border-radius:10px;
          margin-bottom:16px; overflow:hidden; }
  .card h2 { font-size:13px; text-transform:uppercase; letter-spacing:.06em; color:var(--muted);
             margin:0; padding:12px 16px; border-bottom:1px solid var(--line); background:#fbfcfe; }
  .row { display:flex; gap:12px; padding:11px 16px; border-bottom:1px solid #f1f5f9; align-items:flex-start; }
  .row:last-child { border-bottom:0; }
  .tag { flex:none; width:52px; text-align:center; font-size:11px; font-weight:700; padding:2px 0;
         border-radius:4px; text-transform:uppercase; letter-spacing:.04em; }
  .tag.pass { background:#e7f6ee; color:var(--pass); }
  .tag.warn { background:#fef4e6; color:var(--warn); }
  .tag.fail { background:#fdeceb; color:var(--fail); }
  .name { flex:none; width:190px; font-weight:600; }
  .detail { flex:1; min-width:0; word-break:break-word; }
  .fix { display:block; margin-top:4px; color:var(--muted); font-size:13.5px; }
  form { background:var(--card); border:1px solid var(--line); border-radius:10px; padding:16px; margin-bottom:16px; }
  label { display:block; font-size:13px; font-weight:600; margin:10px 0 4px; }
  input { width:100%; padding:8px 10px; border:1px solid var(--line); border-radius:6px; font:inherit; }
  button { margin-top:14px; background:var(--brand); color:#fff; border:0; border-radius:6px;
           padding:9px 18px; font:600 15px system-ui; cursor:pointer; }
  button.danger { background:var(--fail); }
  .note { color:var(--muted); font-size:13.5px; }
  @media (max-width:640px) { .row { flex-wrap:wrap; } .name { width:auto; } }
</style>

<div class="wrap">
  <h1>Upokoron — hosting preflight</h1>
  <p class="sub">Checks whether this cPanel account can run the application. Nothing is installed by this page.</p>

  <?php if ($fails > 0): ?>
    <div class="verdict bad">
      <?php echo $fails; ?> blocking problem<?php echo $fails === 1 ? '' : 's'; ?> found.
      <p>Each one below marked <strong>FAIL</strong> has the exact cPanel fix next to it. Most are a
      setting, not a limitation of the plan — PHP version and missing extensions are both changed from
      cPanel in under a minute.</p>
    </div>
  <?php elseif ($warns > 0): ?>
    <div class="verdict warn">
      No blocking problems. <?php echo $warns; ?> thing<?php echo $warns === 1 ? '' : 's'; ?> to look at.
      <p>The application will run on this host. Read the warnings — some, like HTTPS, matter before you
      take real orders.</p>
    </div>
  <?php else: ?>
    <div class="verdict ok">
      This hosting account can run Upokoron.
      <p>Every requirement is met. Continue with DEPLOY.md.</p>
    </div>
  <?php endif; ?>

  <?php if (! $dbTested): ?>
    <form method="post">
      <h2 style="margin:0 0 4px;font-size:16px">Test the database too</h2>
      <p class="note" style="margin:0">
        Create a database and user in cPanel → MySQL Databases first, then enter them here. This checks the
        MySQL version and, more importantly, whether CHECK constraints are actually <em>enforced</em> —
        older MySQL accepts the syntax and silently ignores it, which would let negative stock through.
        Credentials are used for this one request and never stored.
      </p>
      <label>Host</label>
      <input name="db_host" value="localhost">
      <label>Database name</label>
      <input name="db_name" placeholder="cpaneluser_upokoron" required>
      <label>Username</label>
      <input name="db_user" placeholder="cpaneluser_upokoron" required>
      <label>Password</label>
      <input name="db_pass" type="password">
      <button type="submit">Run database check</button>
    </form>
  <?php endif; ?>

  <?php foreach ($groups as $group => $rows): ?>
    <div class="card">
      <h2><?php echo htmlspecialchars($group); ?></h2>
      <?php foreach ($rows as $r): ?>
        <div class="row">
          <span class="tag <?php echo $r['status']; ?>"><?php echo $r['status']; ?></span>
          <span class="name"><?php echo htmlspecialchars($r['name']); ?></span>
          <span class="detail">
            <?php echo htmlspecialchars($r['detail']); ?>
            <?php if ($r['fix'] !== ''): ?>
              <span class="fix"><?php echo htmlspecialchars($r['fix']); ?></span>
            <?php endif; ?>
          </span>
        </div>
      <?php endforeach; ?>
    </div>
  <?php endforeach; ?>

  <div class="card">
    <h2>Manual check — mod_rewrite</h2>
    <div class="row">
      <span class="detail">
        PHP often cannot see Apache modules. To test rewriting for real, put the deployment
        <code>.htaccess</code> in place and load any URL that is not a file, e.g.
        <code>/anything-not-real</code>. If the React app loads instead of an Apache 404, rewriting works.
      </span>
    </div>
  </div>

  <div class="card">
    <h2>Remove this file</h2>
    <div class="row">
      <span class="detail">
        This page lists your PHP build, paths, and server software. Delete it as soon as you have read it.
        <form method="post" style="border:0;padding:0;background:none;margin-top:10px">
          <button class="danger" name="delete_self" value="1" type="submit">Delete preflight.php now</button>
        </form>
      </span>
    </div>
  </div>
</div>
