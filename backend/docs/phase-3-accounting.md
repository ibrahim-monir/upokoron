# Phase 3 — Accounting Engine
## Chart of accounts · Double-entry journal · Fiscal periods · Trial balance · Profit & Loss

**Status:** complete and verified · **Tests:** 130 passing · **Verified:** the Phase 1 worked example posts through the live API and produces gross profit of exactly ৳2,000

---

## 1. Why this phase comes before inventory and orders

Inventory movements and orders both *post to the ledger*. Building them first would mean writing costing logic against an accounting layer that does not exist yet, then retro-fitting the postings — and retro-fitted accounting is how systems end up with a profit figure that nobody can trace.

So the ledger goes in first, with its guarantees enforced, and everything after it simply calls `JournalService`.

---

## 2. What this phase delivers

| Delivered | File |
|---|---|
| Exact decimal money arithmetic | `app/Support/Money.php` |
| The only writer to the ledger | `app/Services/Accounting/JournalService.php` |
| Account lookup by stable key | `app/Services/Accounting/AccountResolver.php` |
| Period locking | `app/Services/Accounting/PeriodService.php` |
| Trial balance, category totals | `app/Services/Accounting/TrialBalanceService.php` |
| Account and party ledgers | `app/Services/Accounting/LedgerService.php` |
| 65-account BDT retail chart | `database/seeders/ChartOfAccountsSeeder.php` |
| Nightly invariant check | `app/Console/Commands/CheckAccountingIntegrity.php` |

---

## 3. Money is never a float

`0.1 + 0.2` is `0.30000000000000004` in PHP. A ledger built on floats drifts by a paisa at a time until the trial balance stops balancing, and the difference is unfindable.

`Money` is immutable, backed by **bcmath on string operands**, and rounds **half-up** (bcmath truncates by default, which would bias every rounded amount downwards over millions of lines).

```php
Money::of('110.00')->times('5')          // '550.00'
Money::of('0.125')->value()              // '0.13'  half-up, not 0.12
Money::of('1.000000')->times('366.666667')  // '366.67'
```

### `allocate()` — the method partial refunds depend on

Splits an amount across weights so the parts sum **exactly** back to the whole; the rounding remainder goes to the largest weight.

```php
Money::of('100.00')->allocate([1, 1, 1]);
// 33.33 + 33.33 + 33.34 = 100.00  ← not 99.99
```

This is how an order-level discount is pushed down onto line items. Round each share independently and you leave a stray paisa — and that paisa is exactly what makes a partial return unanswerable later. Used in Phase 8.

**One trap this phase hit:** every `Money` operation rounds to 2 decimals, so **order of operations matters**. `2000 ÷ 7500` rounds to `0.27` and reports a 27.00% margin. Multiply first: `2000 × 100 ÷ 7500` = `26.67`. Any percentage must multiply before dividing.

---

## 4. Chart of accounts

65 accounts, 48 wired to posting rules, across 13 account types.

| Range | Category |
|---|---|
| 1000 | Assets |
| 2000 | Liabilities |
| 3000 | Equity |
| 4000 | Revenue (incl. contra) |
| 5000 | Cost of Goods Sold |
| 6000 | Operating Expenses |
| 7000 | Other Income |

### `system_key` — the reason the chart is editable

Posting rules refer to accounts by a stable key, never by id and never by name:

```php
JournalLine::debit('inventory', '10000.00')
JournalLine::credit('accounts_payable', '10000.00')
```

The owner can **rename and renumber** any account and every posting rule keeps working. What they cannot do is change a system account's *type* or deactivate it — the posting rules require an account of that category to exist. Both are enforced with a 409 and a clear message.

### Accounts that are easy to get wrong

| Account | Why it exists |
|---|---|
| **1145 COD Receivable (Courier)** | COD money is not your cash until the courier remits it. Treating delivery as cash overstates the bank balance by everything in transit and hides the courier fee. |
| **1155 Goods in Transit** | Stock that has shipped but not been delivered. An *account*, not a location — the single-inventory rule holds. It is what makes a failed COD delivery a clean one-line reversal. |
| **2130 Reward Points Liability** | Points are a debt to customers, not a counter. A rewards programme kept off the books is a hidden obligation. |
| **5300 Inventory Adjustment (Rounding)** | Where the sub-paisa residue goes when an item's stock hits zero with value left over. Small, but it must go somewhere or Inventory drifts from the stock ledger. |
| **4300 Sales Returns** | Debit-normal, but a *Revenue* category account — see §5. |

### Contra accounts and the sign bug

Sales Returns is **debit-normal** but sits under **Revenue**. A debit to it must *reduce* revenue.

Signing category totals by each account's own normal balance reports a refund as income: ৳1,000 sold less a ৳250 return came out as **৳1,250** instead of ৳750. Fixed — the sign now comes from the **category's** natural direction, not the account's. The same rule makes Accumulated Depreciation (credit-normal, under Assets) correctly *reduce* total assets.

---

## 5. `JournalService` — the single gateway

Nothing else in the system may write to `journal_entries` or `journal_entry_lines`. Both models have an **empty `$fillable`** and **block updates and deletes** outright.

```php
$journal->post('order.revenue', [
    JournalLine::debit('accounts_receivable', '7500.00', party: $customer),
    JournalLine::credit('sales_revenue', '7500.00'),
], reference: $order, memo: 'Order ORD-2026-000141 delivered');
```

Concentrating every posting in one place is what makes the invariants checkable in one place.

### What it validates before writing anything

1. At least two lines.
2. Each line is one-sided and non-negative — also enforced by a MySQL `CHECK` constraint.
3. **Debits equal credits.** Otherwise `UnbalancedEntryException`.
4. The total is non-zero.
5. The date falls in an **open** fiscal period.
6. The event names a source document (see below).

A rejected entry leaves **no partial rows and consumes no document number** — tested.

### Idempotency, and the NULL hole that was found here

`journal_entries` carries `UNIQUE (reference_type, reference_id, event)`. A retried webhook or a double-clicked button physically cannot post the same event twice for the same document.

**But MySQL unique indexes do not constrain NULLs.** During smoke testing, an event posted with no reference was accepted twice and nothing showed it — the protection was silently absent. Any future service that forgot to pass a reference would have lost idempotency invisibly.

Closed: an event must name its source document, unless it is prefixed `manual.`. Manual journal entries genuinely have no natural key and may legitimately repeat; everything else is rejected with an explanation.

| Method | Behaviour on repeat |
|---|---|
| `post()` | Throws `DuplicateJournalEntryException` — a retry got past the caller's own state check |
| `postOnce()` | Returns the **existing** entry — for payment webhooks and retried jobs |

### Immutability and reversal

Posted entries are never edited or deleted. A correction is a **reversing entry** — the mirror image, with debits and credits swapped. Both stay in the ledger and net to zero, which is what an auditor expects and what keeps the trail honest.

Reversals default to **today's** date, not the original's: by the time an error is found, the original period is often closed, and back-dating would silently restate a published month.

An entry cannot be reversed twice, and a reversal cannot itself be reversed.

---

## 6. Fiscal periods

Bangladesh's statutory fiscal year runs **1 July to 30 June**. `FiscalYearSeeder` creates the year covering today with 12 monthly periods, so a fresh install can post immediately.

**Periods must be closed in order.** Skipping ahead would let a later correction land in an earlier month and restate a figure already reported — 409 `earlier_period_open`.

Once closed, nothing posts into that period. This is the mechanism that makes *"history is never recomputed"* enforceable rather than aspirational: a report for a closed month returns the same numbers next year as it does today.

Reopening exists — mistakes are found after a close — but it is a separate, `accounting.close_period`-gated action, never a side effect.

---

## 7. Ledger invariants

```powershell
php artisan accounting:check
```

```
PASS  I1  every entry balances
PASS  I1  headers match their lines
PASS      no orphaned lines
PASS      lines are one-sided and non-negative
PASS      line dates match their entry
PASS  I1  trial balance balances
PASS      reversal links are two-way
```

Runs nightly from the scheduler. These are the failures no report would otherwise reveal: if the trial balance stops balancing, something wrote to the ledger without going through `JournalService`. Extended with the inventory invariants (I2, I3, I4) in Phase 5.

---

## 8. Subledgers are derived, never stored

There is **no** customer ledger table and no supplier ledger table.

A journal line can be tagged with a `party_type` / `party_id`. The customer ledger is those same rows filtered one way; the Accounts Receivable control account is them filtered another. They cannot disagree, because there is only one set of numbers.

That is invariant **I6** — and here it holds *by construction* rather than by a reconciliation job.

```php
$ledger->partyBalance($customer);              // from the GL
$ledger->partyLedger($customer, $from, $to);   // running balance
$ledger->accountLedger($account, $from, $to);
```

---

## 9. The worked example, posted for real

From the Phase 1 architecture: buy 100 @ ৳100, then 100 @ ৳120 (average ৳110), sell 50 @ ৳150.

```
Dr Inventory            10,000    Cr Accounts Payable    10,000
Dr Inventory            12,000    Cr Accounts Payable    12,000
Dr Goods in Transit      5,500    Cr Inventory            5,500   ← shipped, no revenue yet
Dr Accounts Receivable   7,500    Cr Sales Revenue        7,500   ← delivered
Dr COGS                  5,500    Cr Goods in Transit     5,500   ← same moment
```

Live API output:

```
Net sales      7,500.00
COGS           5,500.00
GROSS PROFIT   2,000.00
Gross margin      26.67%

TRIAL BALANCE   debits 29,500.00   credits 29,500.00   balanced ✓

1140 Accounts Receivable    Dr   7,500.00
1150 Inventory              Dr  16,500.00     ← 22,000 − 5,500
1155 Goods in Transit       Dr       0.00     ← cleared on delivery
2110 Accounts Payable       Cr  22,000.00
4100 Sales Revenue          Cr   7,500.00
5100 Cost of Goods Sold     Dr   5,500.00
```

Gross profit is ৳2,000 and provable from the ledger alone.

**Revenue and COGS are recognised together, on delivery** — not at order confirmation. With Bangladesh's COD return-to-origin rates, confirmation-time recognition overstates sales by the entire failed-delivery rate. Deferring to delivery makes an RTO a one-line reversal with no revenue to unwind.

---

## 10. Database

Six tables added.

| Table | Notes |
|---|---|
| `account_types` | 13 types. `normal_balance` lives here, so contra accounts work. |
| `accounts` | 65 rows. `system_key` unique; `is_system` protects posting rules. |
| `fiscal_years` | July–June by default. |
| `fiscal_periods` | 12 per year; `status` open/closed. |
| `journal_entries` | **No `updated_at`, no `deleted_at`.** `UNIQUE (reference_type, reference_id, event)`. |
| `journal_entry_lines` | `entry_date` denormalised for fast reports. `CHECK` constraint enforces one-sided, non-negative. |

`entry_date` is copied onto every line on purpose: ledger and trial-balance queries filter by date across potentially millions of rows, and carrying the date turns those into a single indexed scan instead of a join per row.

---

## 11. API — 35 admin routes total

| Method | Path | Permission |
|---|---|---|
| GET | `admin/accounts` | `accounting.view` |
| GET | `admin/accounts/types` | `accounting.view` |
| POST/PUT/DELETE | `admin/accounts/{account}` | `accounts.manage` |
| GET | `admin/journal-entries` | `accounting.view` |
| POST | `admin/journal-entries` | `accounting.post` |
| GET | `admin/journal-entries/{entry}` | `accounting.view` |
| POST | `admin/journal-entries/{entry}/reverse` | `accounting.reverse` |
| GET | `admin/reports/trial-balance` | `reports.financial` |
| GET | `admin/reports/profit-loss` | `reports.financial` |
| GET | `admin/reports/account-ledger/{account}` | `reports.financial` |
| GET | `admin/fiscal-periods` | `accounting.view` |
| POST | `admin/fiscal-years` | `accounting.close_period` |
| POST | `admin/fiscal-periods/{period}/close` | `accounting.close_period` |
| POST | `admin/fiscal-periods/{period}/reopen` | `accounting.close_period` |

There is deliberately **no update or delete route** for journal entries.

`accounting.post` and `accounting.reverse` are separate permissions. An accountant posts; unwinding an already-reported figure is the owner's call.

### Validation

`StoreJournalEntryRequest` checks the entry balances **before** it reaches `JournalService`, so a mistyped figure returns **422 with a field message** rather than a 500-level bug report:

```json
{ "message": "Debits and credits must match. Debits ৳100.00, credits ৳90.00, difference ৳10.00." }
```

Group accounts are rejected at the validation layer — they are report headers, and posting to one produces a balance nobody reads.

---

## 12. Testing

```powershell
php artisan test --filter=Accounting
php artisan test --filter=MoneyTest
php artisan accounting:check
```

| Suite | Covers |
|---|---|
| `MoneyTest` | Float-error immunity, half-up rounding, allocation summing exactly |
| `JournalServiceTest` | Balance enforcement, idempotency, the NULL-reference hole, immutability, reversal, closed periods, party tagging |
| `TrialBalanceTest` | The worked example, contra-revenue signing, as-of dates, subledger vs control account |
| `AccountingApiTest` | Permissions per role, 422 vs 409, system-account protection, period close ordering |

### By hand

[`docs/api.http`](api.http) requests **#19 → #35**. Running **#21 → #26** in order posts the worked example and returns gross profit ৳2,000. **#29** and **#30** show the refusals; **#35** shows out-of-order period closing rejected.

---

## 13. Bugs found and fixed in this phase

**1. NULL reference defeated the idempotency index.** MySQL does not enforce uniqueness across NULLs, so a document event posted without a reference could be duplicated freely and silently. Now rejected unless the event is prefixed `manual.`.

**2. Contra-revenue was signed by the account's normal balance instead of the category's**, so a sales return was added to revenue rather than subtracted. ৳1,000 − ৳250 reported as ৳1,250.

**3. Gross margin lost to rounding.** `2000 ÷ 7500` rounds to `0.27` before the ×100, reporting 27.00% instead of 26.67%. Percentages must multiply before dividing.

**4. `JournalEntryLine::create()` wrote nothing.** The model has an empty `$fillable` by design, so mass assignment silently dropped every attribute. Switched to `forceCreate`.

**5. Exception filename did not match its class**, which would have broken PSR-4 autoloading the moment it was first thrown.

---

## 14. Deliberately deferred

- **Balance sheet endpoint** — the data is all there via `categoryTotals()`; the presentation lands with the report suite in **Phase 11**.
- **Year-end closing entry** (P&L accounts swept into Retained Earnings) — **Phase 12**, alongside period close.
- **`account_period_balances` cache** — the trial balance currently sums the lines directly. Fine well past 100k lines; revisit in Phase 11 if reports slow on shared hosting.
- **Parallel concurrency tests** — **Phase 13**.

---

*Previous: [Phase 2 — Foundation](phase-2-foundation.md) · Next: Phase 4 — Catalog*
