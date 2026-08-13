# Deploying Upokoron to cPanel shared hosting

This is the full procedure, written for a **basic cPanel plan** — no SSH
guaranteed, no Docker, no Node.js on the server, no Redis, no long-running
queue worker.

Read [Before you start](#0-before-you-start) first. It says plainly what a
deployment today does and does not give you.

---

## 0. Before you start

**The shop cannot take orders yet.** Cart and checkout are Phases 7 and 8, and
they are not built. Deploying today gives you:

| Works | Does not exist yet |
| --- | --- |
| Public storefront: home, categories, product pages, search | Cart |
| Full admin panel: products, variations, categories, attributes, stock, image library | Checkout, orders |
| Accounting: chart of accounts, journal, trial balance, P&L | Payments, COD flow |
| Inventory: stock ledger, weighted average cost, reservations | Shipping, coupons, returns |
| Staff accounts, roles, 62 permissions | Customer accounts placing orders |

That is still worth doing now, and doing it now is the right call for one
specific reason: **it proves the host can run the system before more is built
on top of it.** A hosting limitation found today costs an afternoon. The same
limitation found after checkout is written costs a migration.

What you get on the live domain: a browsable shop you can load real products
into, and a working back office. What you do not get: a way for a customer to
buy. Treat it as a staging deployment on the real domain, not a launch.

---

### This layout has been run, not just written

Before this guide was published, the built bundle was served through a
stand-in for the Apache rules and exercised end to end: the storefront and
its API, `sanctum/csrf-cookie`, admin login, and every admin screen's
endpoint — products, inventory, valuation, trial balance, profit and loss,
journal entries, accounts, media, users, settings, audit log. A real image
was uploaded through `/api/v1/admin/media` and served back from
`/uploads/...`, and the SPA fallback was checked on a deep reload.

That run found two things this guide would otherwise have shipped over: the
bundle demanded PHP 8.4 (fixed — see below), and `GET /admin/inventory`
returned a 500 because the stock summary aliased a `COUNT` as `lines`, which
MySQL reserves. Both are fixed and covered by tests. It is worth saying
plainly: neither was visible from reading the code.

---

## 1. Preflight — can this host run it at all?

Do this **before** building or uploading anything else.

1. Upload `deploy/preflight.php` to `public_html/`.
2. Open `https://your-domain.com/preflight.php`.
3. Create a database and user in **cPanel → MySQL Databases**, then enter them
   in the form on that page and run the database check too.
4. Fix everything marked **FAIL**. Each one names the exact cPanel screen.
5. **Delete the file** — there is a button at the bottom of the page. It
   reports your PHP build and server paths, which is not information to leave
   sitting on a public URL.

### What the host must provide

| Requirement | Why | If missing |
| --- | --- | --- |
| **PHP 8.3+** | Laravel 13. 8.3 is deliberately the floor rather than 8.4 — see [the platform pin](#why-the-bundle-runs-on-php-83-and-not-only-84) | cPanel → MultiPHP Manager. Free, one minute. If the host has no 8.3, the plan cannot run this. |
| **`bcmath`** | Every price, cost, and ledger amount is computed with it. Without it nothing financial runs at all. | cPanel → Select PHP Version → Extensions |
| `pdo_mysql`, `mbstring`, `openssl`, `tokenizer`, `xml`, `ctype`, `json`, `fileinfo`, `curl`, `zip` | Standard Laravel set | Same screen |
| **MySQL 8.0.16+ or MariaDB 10.3+** | `CHECK` constraints, stored generated columns, recursive category queries | Below this, MySQL *accepts* `CHECK` syntax and silently ignores it — the database would let negative stock through while looking correct. Not negotiable. |
| **InnoDB** | Transactions and row locking are what keep stock and the ledger correct when two orders arrive together | Universal on modern hosts |
| **mod_rewrite** | Laravel routing and SPA URLs | Universal |
| memory_limit 256M | Comfortable headroom | cPanel → Select PHP Version → Options |
| **Cron Jobs** | Queue draining, expiring stock reservations, nightly integrity check | Standard on cPanel. Without it, abandoned carts hold stock forever. |
| SSL certificate | Login cookies are `Secure` in production | cPanel → SSL/TLS Status → Run AutoSSL (free) |

Deliberately **not** required, because shared hosting usually cannot give them:
SSH, Composer on the server, Node.js on the server, Redis, `symlink()`,
`exec()`, a supervisor or daemon, more than one PHP process.

---

## 2. Build the bundle on your own machine

Everything that needs Node or Composer happens here, not on the server.

```powershell
powershell -ExecutionPolicy Bypass -File deploy\build.ps1
```

This produces:

```
deploy/build/
├── laravel.zip              -> extract to  /home/USER/laravel
├── public_html.zip          -> extract to  /home/USER/public_html
└── env.production.example   -> reference for step 5
```

`vendor/` is built into the bundle on purpose. Most basic plans have no
Composer, and where they do, `composer install` frequently exceeds the memory
limit halfway through and leaves a broken half-installed tree.

The local `.env` is **never** copied into the bundle. A bundle gets emailed and
left in a Downloads folder; a development database password should not travel
with it.

### Why the bundle runs on PHP 8.3 and not only 8.4

`composer.json` pins `config.platform.php` to `8.3.0`. Without that pin,
composer resolves against whatever PHP built the bundle — on a machine running
8.4 that means Symfony 8, which requires **PHP ≥ 8.4.1**, and the result then
dies on any host still offering 8.3 with an unexplained 500.

Laravel 13 works with Symfony 7.4, so the pin costs one Symfony major and buys
every 8.3 host. `build.ps1` reads `vendor/composer/platform_check.php` back
after installing and refuses to produce a bundle that needs more than 8.3 —
a stale lock file resolved on someone else's machine would otherwise pass
every other check and fail only after upload.

---

## 3. The layout on the server

```
/home/USER/
├── laravel/                  ← the application. NOT reachable over the web.
│   ├── app/ bootstrap/ config/ database/ routes/ vendor/
│   ├── storage/              ← must be writable
│   └── .env                  ← chmod 600
│
└── public_html/              ← the document root
    ├── index.html            ← React build
    ├── assets/               ← hashed JS and CSS
    ├── .htaccess             ← HTTPS, SPA fallback, /sanctum routing
    ├── uploads/              ← product images  (chmod 755, writable)
    │   └── .htaccess         ← nothing here may execute
    └── api/
        ├── index.php         ← Laravel front controller
        └── .htaccess
```

The point of the split: `.env`, the source code, and the logs live **above**
the document root, so no URL can reach them. Uploading Laravel into
`public_html` and relying on `.htaccess` to hide `.env` is the usual shortcut,
and it is one misconfigured server away from publishing your database
password.

### Why `api/index.php` is not the stock Laravel one

A front controller in a subdirectory makes Symfony compute a base URL of
`/api` and hand the router `v1/shop/products` — with the `api` prefix already
eaten. Every route then 404s, and it looks like a routing bug. The deployed
file sets `SCRIPT_NAME` to `/index.php` so the router sees the full
`api/v1/shop/products`, identical to development. That is the only difference,
and it is commented in the file.

---

## 4. Upload

1. **cPanel → File Manager**.
2. Go to your **home directory** (one level above `public_html`).
3. Upload `laravel.zip`, then **Extract**. Confirm you end up with
   `/home/USER/laravel/artisan`, not `/home/USER/laravel/laravel/artisan`.
4. Go into `public_html`. If anything is already there (a default index page,
   the old site), move it aside first.
5. Upload `public_html.zip` and **Extract** there.
6. In File Manager, turn on **Settings → Show Hidden Files** and check that
   `.htaccess` exists in `public_html/`, `public_html/api/`, and
   `public_html/uploads/`. Zip extraction sometimes drops dotfiles; if any are
   missing, create them by hand from `deploy/*.htaccess`.

Permissions — cPanel usually gets these right, fix only if something fails:

| Path | Mode |
| --- | --- |
| `laravel/storage` and everything under it | 755 |
| `laravel/bootstrap/cache` | 755 |
| `public_html/uploads` | 755 |
| `laravel/.env` | **600** |

---

## 5. Configure

1. Copy `env.production.example` into `/home/USER/laravel/` and rename it to
   `.env` (File Manager → Rename; enable hidden files first).
2. Edit it and replace every CAPITALISED placeholder.
3. Set permissions on it to **600**.

The four that are most often wrong, and how each one fails:

| Setting | Wrong value | Symptom |
| --- | --- | --- |
| `SESSION_DOMAIN` | missing leading dot, or the wrong host | Login appears to succeed, then every page says logged out. The browser accepted the response and dropped the cookie. |
| `SESSION_SECURE_COOKIE=true` | set before SSL is issued | Nobody can log in at all. Leave it `false` until AutoSSL has run, then turn it on. |
| `UPLOADS_ROOT` | relative path, or a trailing slash | Image uploads 500. It must be the absolute path, e.g. `/home/USER/public_html/uploads`. |
| `APP_DEBUG` | `true` | A stack trace on any error shows your database password and app key to whoever triggered it. |

---

## 6. Run the setup commands

Two routes. Try Terminal first.

### 6a. If cPanel has **Terminal**

```bash
cd ~/laravel

php artisan key:generate --force
php artisan migrate --force
php artisan db:seed --class=DatabaseSeeder --force

php artisan config:cache
php artisan route:cache
php artisan view:cache
```

Then confirm the books are sound:

```bash
php artisan accounting:check
```

### 6b. If there is **no Terminal** — use a one-off cron job

This works on every cPanel plan and needs nothing extra.

**cPanel → Cron Jobs → Add New Cron Job**, set it to run **Once Per Minute**,
and paste one command at a time. Everything is appended to a log you can read
in File Manager:

```
cd /home/USER/laravel && /usr/local/bin/php artisan key:generate --force >> /home/USER/laravel/storage/logs/deploy.log 2>&1
```

Wait a minute, open `storage/logs/deploy.log`, confirm it worked, then **edit
the same cron job** to the next command:

```
cd /home/USER/laravel && /usr/local/bin/php artisan migrate --force >> /home/USER/laravel/storage/logs/deploy.log 2>&1
```

```
cd /home/USER/laravel && /usr/local/bin/php artisan db:seed --class=DatabaseSeeder --force >> /home/USER/laravel/storage/logs/deploy.log 2>&1
```

```
cd /home/USER/laravel && /usr/local/bin/php artisan optimize >> /home/USER/laravel/storage/logs/deploy.log 2>&1
```

**Delete that cron job when you are finished.** Leaving it running
`db:seed` every minute is harmless only until it is not.

> The PHP path is usually `/usr/local/bin/php`, but cPanel's MultiPHP often
> needs the versioned binary instead — try `/usr/local/bin/ea-php83` or
> `/opt/cpanel/ea-php83/root/usr/bin/php` if you get "command not found". The
> **Cron Jobs** page usually shows the correct path in its examples.

### The owner account

`DatabaseSeeder` creates the first staff account from `OWNER_EMAIL` and
`OWNER_PASSWORD` in `.env`. In production it **refuses to run without
`OWNER_PASSWORD` set** — there is deliberately no default admin password to
forget about.

Use a long random one, sign in at `https://your-domain.com/login`, change it,
then blank `OWNER_PASSWORD` out of `.env` again.

---

## 7. The one cron job you keep

**cPanel → Cron Jobs**, run **Once Per Minute**:

```
/usr/local/bin/php /home/USER/laravel/artisan schedule:run >> /dev/null 2>&1
```

That single entry drives everything (see `backend/routes/console.php`):

- drains the queue every minute (`queue:work --stop-when-empty --max-time=50`)
  — shared hosting cannot keep a worker alive, so the scheduler does it in
  short bursts instead;
- releases expired stock reservations every 5 minutes, so an abandoned
  checkout does not hold stock hostage and show the shop as sold out;
- rebuilds the `reserved_quantity` caches at 01:00;
- runs `accounting:check` at 02:00 and **emails you if any invariant breaks** —
  if that mail ever arrives, something wrote to the ledger or the stock tables
  without going through a service.

---

## 8. SSL

**cPanel → SSL/TLS Status → Run AutoSSL.** Free, and it renews itself.

Order matters:

1. Deploy with `SESSION_SECURE_COOKIE=false` and the HTTPS block in
   `public_html/.htaccess` commented out.
2. Run AutoSSL and confirm `https://` loads.
3. Set `SESSION_SECURE_COOKIE=true`, uncomment the HTTPS redirect, and
   re-run `php artisan config:cache`.

Doing it the other way round gives you a redirect loop on a host that is not
serving 443 yet, and no way to log in to fix it.

---

## 9. Verify

Work down the list. Each step fails differently, so stop at the first failure
rather than pushing on.

| # | Check | Expected |
| --- | --- | --- |
| 1 | `https://your-domain.com/api/v1/health` | `{"success":true,...}` |
| 2 | `https://your-domain.com/` | The storefront, styled |
| 3 | Reload on `https://your-domain.com/products` | Still the shop, not an Apache 404 (proves the SPA fallback) |
| 4 | `https://your-domain.com/sanctum/csrf-cookie` | Empty 204, and an `XSRF-TOKEN` cookie appears |
| 5 | Log in at `/login` | Reaches `/admin` and stays logged in after a reload |
| 6 | Admin → Image library → upload a photo | Appears in the grid, and its URL loads directly |
| 7 | Admin → Products → create a product | Saves, and shows on the storefront |
| 8 | Admin → Reports → Trial balance | Debits equal credits |
| 9 | `https://your-domain.com/laravel/.env` and `/storage/logs/laravel.log` | The React app's HTML. **Not** the file contents — see below. |
| 10 | Wait 2 minutes, check `storage/logs/` | The scheduler is running without errors |

On step 9, do not expect a 404. The SPA fallback answers every unknown path
with `index.html`, so those URLs return **200 with the React page** — which is
correct, and is not the same as serving the file. What matters is that the
contents never appear:

```bash
curl -s https://your-domain.com/laravel/.env | grep -E 'APP_KEY|DB_PASSWORD'
```

That must print **nothing**. If it prints your key, the application is inside
the document root and the layout in section 3 was not followed.

---

## 10. When something is wrong

| Symptom | Cause | Fix |
| --- | --- | --- |
| Blank white page | `APP_DEBUG=false` hiding a fatal error | Read `laravel/storage/logs/laravel.log` |
| 500 on every request | `storage/` or `bootstrap/cache` not writable | chmod 755 |
| "Upokoron is not installed at the expected location" | `laravel/` is not where `api/index.php` expects | The message prints both paths; fix `$app_root` or move the folder |
| Every API route 404s, storefront loads | `api/.htaccess` missing (zip dropped the dotfile) | Recreate it from `deploy/api.htaccess` |
| Login succeeds then immediately logs out | `SESSION_DOMAIN` or `SANCTUM_STATEFUL_DOMAINS` does not match the real host | Fix both, then `php artisan config:cache` |
| 419 on every form | CSRF cookie not reaching the browser | Check `SESSION_SECURE_COOKIE` against whether you are actually on HTTPS |
| Image upload 500s | `UPLOADS_ROOT` wrong or `uploads/` not writable | Absolute path, no trailing slash, chmod 755 |
| Images upload but show broken | `UPLOADS_URL` should be `/uploads`, not an absolute URL | Fix, then `config:cache` |
| Config changes have no effect | Cached config still in memory | `php artisan config:clear` then `config:cache` |
| "Class not found" after upload | `vendor/` incomplete — an interrupted upload | Re-upload `laravel.zip` |

Anything unexplained: put `preflight.php` back, run it, delete it again.

---

## 11. Deploying an update later

```powershell
powershell -ExecutionPolicy Bypass -File deploy\build.ps1
```

Then on the server:

1. `php artisan down` (or the cron equivalent) — skip for frontend-only changes.
2. Replace `public_html/assets/` and `index.html` with the new build. Leave
   `uploads/` alone.
3. Replace `laravel/app`, `config`, `database`, `routes`, `vendor` — leave
   `.env` and `storage/` alone.
4. `php artisan migrate --force`
5. `php artisan optimize` (re-caches config, routes, views)
6. `php artisan up`

**Never** overwrite `.env`, `storage/`, or `public_html/uploads/` on an update.
That is where all the state lives.

---

## 12. Backups

Take these before every update, and on a schedule once real orders exist.

- **Database** — cPanel → Backup → Download a MySQL Database Backup. This is
  the one that matters: it holds the ledger and the stock movements, and
  neither can be reconstructed from anything else.
- **`public_html/uploads/`** — product images.
- **`laravel/.env`** — keep it somewhere private. Losing `APP_KEY` makes every
  existing session and encrypted value unreadable.

The code is in git and does not need backing up.

---

## 13. What this deployment deliberately does not do

Each of these is a shared-hosting reality, not an oversight:

- **No `storage:link`.** cPanel usually disables `symlink()`, and the command
  then fails in a way that is easy to miss. Uploads are written straight into
  the served directory instead.
- **No queue daemon.** No supervisor on shared hosting. The scheduler drains
  the queue in one-minute bursts.
- **No Redis.** Cache and queue both run on the database. Redis stays optional.
- **No Node.js on the server.** The React app is static files; Vite runs on
  your machine.
- **No Composer on the server.** `vendor/` ships in the bundle.
