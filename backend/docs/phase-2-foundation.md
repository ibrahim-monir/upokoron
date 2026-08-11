# Phase 2 — Foundation
## Laravel setup · Authentication · Roles & permissions · Settings · Document numbering · Audit trail

**Status:** complete and verified · **Tests:** 66 passing at end of phase (130 total after Phase 3) · **Stack:** Laravel 13.24 · PHP 8.4.23 · MySQL 8.0.30 · Sanctum 4.3 · spatie/laravel-permission 8.3

---

## 1. What this phase delivers

Everything later phases stand on: who can sign in, what they are allowed to touch, where configuration lives, how documents get their numbers, and how every change is recorded. No business logic yet — but the four mechanisms here are used by every module that follows.

| Delivered | Why it exists |
|---|---|
| Sanctum auth, dual-mode | The React SPA uses an HttpOnly session cookie; a future mobile app uses a bearer token. Same endpoints. |
| 60 permissions across 6 roles | Declared up front, including permissions for modules not yet built, so roles are designed once instead of patched every phase. |
| `SettingsService` | Runtime-editable business config that falls back to code defaults, so a fresh install works before anyone opens the settings screen. |
| `DocumentNumberService` | Concurrency-safe order/invoice numbers under a row lock. |
| Audit trail | Append-only record of every change to identity, money, and stock. |

---

## 2. Environment

The machine has two PHP installs, and only one of them works.

```
C:\xampp\php\php.exe                                  8.2.12  ← on PATH, WRONG
C:\laragon\bin\php\php-8.4.23-Win32-vs17-x64\php.exe  8.4.23  ← use this
```

Laravel 13 requires PHP 8.3+, and `gd`/`zip`/`intl` are only present in Laragon's build. Every command in this document assumes:

```powershell
$env:PATH = "C:\laragon\bin\php\php-8.4.23-Win32-vs17-x64;" + $env:PATH
cd C:\laragon\www\upokoron\backend
```

**Trap worth knowing:** `php artisan install:api` shells out to Composer, which picks up XAMPP's PHP from PATH and fails on the version constraint. Install packages with `composer require` directly instead, running Composer's phar under the 8.4 binary.

**Second trap:** `.env` written by PowerShell's `Set-Content -Encoding utf8` carries a UTF-8 BOM that corrupts the first key. Write it with `[System.IO.File]::WriteAllText($path, $text, (New-Object System.Text.UTF8Encoding $false))`.

### Databases

```sql
CREATE DATABASE upokoron      CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE upokoron_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

Tests run against **MySQL, not SQLite**. The schema relies on generated stored columns, CHECK constraints, and `SELECT … FOR UPDATE`, none of which SQLite shares — testing against a different engine would prove nothing about the invariants the inventory and accounting phases rest on.

---

## 3. Files

```
backend/
├── config/upokoron.php                      business config + all setting defaults
├── bootstrap/app.php                        middleware aliases, uniform API error shape
├── app/
│   ├── Enums/
│   │   ├── AuditEvent.php
│   │   └── SettingType.php
│   ├── Exceptions/BusinessRuleException.php  409, distinct from 422
│   ├── Http/
│   │   ├── Controllers/Api/V1/
│   │   │   ├── Auth/{Register,Login,Profile,Password}Controller.php
│   │   │   └── Admin/{User,Role,Setting,AuditLog}Controller.php
│   │   ├── Middleware/{EnsureAdminAccess,EnsureAccountIsActive}.php
│   │   ├── Requests/Auth/{Register,Login,UpdateProfile}Request.php
│   │   ├── Requests/Admin/{StoreUser,UpdateUser}Request.php
│   │   └── Resources/{User,Customer,CustomerAddress,Role,AuditLog}Resource.php
│   ├── Models/
│   │   ├── Concerns/Auditable.php
│   │   ├── User.php  Customer.php  CustomerAddress.php  CustomerGroup.php
│   │   └── Setting.php  DocumentSequence.php  AuditLog.php
│   ├── Observers/AuditableObserver.php
│   ├── Policies/{User,Role}Policy.php
│   ├── Providers/AppServiceProvider.php      rate limiters, policies, strict models
│   ├── Services/
│   │   ├── Auth/{RegistrationService,AuthSessionIssuer}.php
│   │   └── Support/{Settings,DocumentNumber,Audit}Service.php
│   └── Support/Permissions.php               the whole permission catalogue
├── database/
│   ├── migrations/                           users, settings, sequences, audit, customers
│   └── seeders/{RolePermission,Settings,Owner}Seeder.php
├── routes/api.php  routes/api/{shop,admin}.php
└── tests/Feature/{Auth,Admin,Support}/
```

---

## 4. Database

27 tables total after Phase 3. Phase 2 owns these:

| Table | Notes |
|---|---|
| `users` | One table for staff **and** customers. `email` and `phone` both nullable+unique; at least one required. Soft-deletes. |
| `customers` | 1:1 profile on a user. `user_id` nullable so admin can create a phone-order customer who never registered. |
| `customer_addresses` | `is_default_shipping` / `is_default_billing` flags — no circular FK back to `customers`. |
| `customer_groups` | Referenced later by coupon eligibility. |
| `settings` | `key` is **globally unique**, not scoped by group. |
| `document_sequences` | Identity is `(key, period_year, period_month)`. |
| `audit_logs` | No `updated_at`, no soft delete. |
| Spatie tables | `roles`, `permissions`, `role_has_permissions`, `model_has_roles`, `model_has_permissions` |

### Design decisions

**One `users` table for everyone.** Roles decide what a session may reach; there is no user "type" flag. A staff member can therefore also shop without a second account. Admin access is gated by the `admin.access` permission.

**Phone as a first-class identifier.** In Bangladesh the phone is usually the real identifier, so login takes one `identifier` field and matches either. Regex `^01[3-9]\d{8}$`.

**Addresses are snapshotted onto orders later, not foreign-keyed.** A customer editing their address in 2027 must not silently rewrite where a 2026 order was delivered. `CustomerAddress::toSnapshot()` exists for that.

---

## 5. Authentication

Two modes on the same endpoints:

- **Session cookie** (default) — the SPA is served from the same origin as the API, so auth is an HttpOnly, CSRF-protected cookie. An XSS bug cannot walk away with a long-lived credential.
- **Bearer token** — used when the caller sends `device_name`. For a future mobile app, where cookies are not workable.

`AuthSessionIssuer` decides which, and `bootstrap/app.php` enables `$middleware->statefulApi()`.

**Token abilities are never `*`.** A token carries its user's permission names as abilities; an account with no permissions gets `['storefront']`. A leaked customer token cannot be replayed against an admin endpoint.

### Rate limiting — two independent layers

| Layer | Limit | Keyed on |
|---|---|---|
| Route (`throttle:auth`) | 10/min, 100/day | IP |
| `LoginRequest` | 5 attempts then lockout | **identifier + IP together** |

Keying the second on identifier *and* IP together matters: keyed on identifier alone, an attacker could lock a customer out of their own account from anywhere.

Failed logins return the **same message** whether or not the account exists, so the endpoint cannot enumerate customers.

---

## 6. Roles and permissions

60 permissions in 11 groups, declared in `app/Support/Permissions.php`. `RolePermissionSeeder` is idempotent and syncs the database to that file, so a permission added in a later phase reaches existing installations on deploy — and one removed from the file is dropped from every role.

| Role | Permissions | Can do |
|---|---|---|
| `owner` | all 60 | Everything, including reversing ledger entries and closing periods |
| `manager` | 45 | Catalog, stock, purchases, orders, returns, staff — but no accounting, no role definition |
| `accountant` | 26 | All money and reports; cannot change a product price |
| `stock_manager` | 22 | Catalog, purchases, inventory |
| `support` | 11 | Move orders along, handle returns; read-only on money |
| `customer` | 0 | Storefront only |

### The privilege escalation guard

A manager holds `users.manage`. Without a guard they could create an owner account and take the store.

`UserPolicy::assignRoles()` enforces a general rule: **you may only grant roles whose permissions you already hold yourself.** Not a blacklist of role names — a subset check. It keeps working when new roles are added. The same rule applies in `RoleController` when building a custom role.

Also enforced: only an owner may edit an owner; nobody may delete their own account; the last owner cannot be removed.

---

## 7. Document numbering

`MAX(id) + 1` hands the same order number to two customers who check out in the same millisecond, and the duplicate is usually found later by an accountant.

`DocumentNumberService::next()` takes a **row lock** on the sequence row and increments it. Call it **inside** the transaction that creates the document — the lock is then held until commit, so a rolled-back document also rolls back its number and leaves no gap.

```
ORD-2026-000141   yearly reset
CUS-000001        no reset
JV-2026-000004    yearly reset
```

**Year boundaries are evaluated in Dhaka time, not UTC.** An order placed at 05:00 on 1 January in Dhaka is 19:00 on 31 December UTC; numbering it into the previous year would file it in the wrong fiscal period.

---

## 8. Settings

Lookup order is **database → config default**. A key that has never been saved still resolves, so adding a setting in code needs no data migration.

28 settings in 6 groups, defined in `config/upokoron.php`. Money and rates come back as **strings**, never floats — they feed bcmath arithmetic.

```php
$settings->get('revenue_recognition_point');   // 'delivered'
$settings->int('reservation_ttl_minutes');     // 30
$settings->decimal('redemption_rate');         // '0.50'  (string)
$settings->bool('allow_guest_checkout');       // true
```

Only keys declared in config can be written through the API. Without that check, an attacker could stuff arbitrary rows into the table and shadow a key the application later starts reading.

Public settings (store name, currency) are readable without auth at `GET /api/v1/shop/settings`. Commission rates and stock policy are not exposed.

---

## 9. Audit trail

Append-only. Attach the `Auditable` trait to any model touching money, stock, permissions, or identity.

- Records **only what changed** — an update touching just `updated_at` writes no row.
- Passwords and tokens are never written. Enforced by `auditExclude()` and tested.
- Console and scheduler events have no actor; `user_id` stays null rather than being faked.
- Logins, failed logins, and password changes are logged explicitly.

---

## 10. API — 9 shop routes, 35 admin routes

### Storefront `/api/v1/shop`

| Method | Path | Auth |
|---|---|---|
| GET | `settings` | none |
| POST | `auth/register` | none, throttled |
| POST | `auth/login` | none, throttled |
| POST | `auth/forgot-password` | none, throttled |
| POST | `auth/reset-password` | none, throttled |
| POST | `auth/logout` | sanctum |
| GET | `auth/me` | sanctum |
| PUT | `auth/profile` | sanctum |
| PUT | `auth/password` | sanctum |

### Admin `/api/v1/admin`

| Method | Path | Permission |
|---|---|---|
| POST | `auth/login` | requires `admin.access` |
| GET/POST | `users` | `users.view` / `users.manage` |
| GET/PUT/DELETE | `users/{user}` | `users.view` / `users.manage` |
| POST | `users/{id}/restore` | `users.manage` |
| GET | `permissions` | `roles.manage` or `users.manage` |
| GET/POST | `roles` | `roles.manage` |
| GET/PUT/DELETE | `roles/{role}` | `roles.manage` |
| GET/PUT | `settings` | `settings.manage` |
| GET | `audit-logs` | `audit.view` |

### Error shape

Uniform across the API:

```json
{ "message": "...", "code": "...", "errors": { "field": ["..."] } }
```

| Status | Meaning |
|---|---|
| 401 | Not signed in |
| 403 | Signed in, not allowed |
| **409** | Input is fine, **business rules say no** — insufficient stock, closed period |
| 422 | Input is malformed |

409 vs 422 is a deliberate split. The frontend needs to tell "you typed it wrong" apart from "the answer is no".

---

## 11. Running it

```powershell
$env:PATH = "C:\laragon\bin\php\php-8.4.23-Win32-vs17-x64;" + $env:PATH
cd C:\laragon\www\upokoron\backend

php artisan migrate:fresh --seed --force
php artisan serve --port=8010
```

Owner login: `owner@upokoron.test` / `upokoron-dev-2026` (from `.env`, `OWNER_PASSWORD`).

In production `OwnerSeeder` **refuses to seed** without `OWNER_PASSWORD` set — a default admin password nobody remembers to change is how stores get taken over.

### Trying it by hand

Open [`docs/api.http`](api.http) in VS Code with the **REST Client** extension (`humao.rest-client`) and click *Send Request*. Requests run top to bottom and pass their tokens along.

Requests **#12 → #13 → #14** demonstrate the escalation guard: a manager signs in, is refused when creating an owner, and succeeds when creating support staff.

### Tests

```powershell
php artisan test
php artisan test --filter=UserManagementTest
```

---

## 12. Bugs found and fixed in this phase

**1. `Model::observe()` inside a trait boot method crashes.** It calls `new static` internally, which re-enters the boot already running; Laravel detects the recursion and throws `LogicException`. Fixed by registering the events directly via `registerModelEvent`, which never constructs the model.

**2. Duplicate setting keys.** `enabled` was declared under `rewards`, `affiliate`, and `tax`, but setting keys are globally unique. Renamed to `rewards_enabled` / `affiliate_enabled` / `tax_enabled`, and `SettingsSeeder` now detects duplicates with a readable error instead of a mid-deploy SQL failure.

**3. A test passing for the wrong reason.** `test_a_manager_cannot_create_a_user_more_powerful_than_themselves` was green — but because the manager role had no `users.manage` at all, so the 403 came from a missing permission, not from the escalation guard. The guard itself was never exercised. Manager was given `users.manage`, and the test now actually tests what it claims.

**4. Login audit rows had no actor.** Token mode never populates the auth guard, so `Auth::id()` was null when the login was recorded. `AuthSessionIssuer` now calls `Auth::setUser()`.

---

## 13. What is deliberately not done yet

- **Concurrency is tested sequentially, not in parallel.** `DocumentNumberServiceTest` allocates 200 numbers and asserts they are unique and gapless — but in one process. Proving the row lock holds under real contention needs a parallel harness, which lands in **Phase 13**.
- **Password reset is email-only.** Accounts registered with only a phone need SMS OTP, which arrives with notifications in **Phase 12**.
- **No customer address CRUD endpoints yet** — the tables and model exist; the storefront endpoints come in **Phase 7**.

---

*Next: [Phase 3 — Accounting Engine](phase-3-accounting.md)*
