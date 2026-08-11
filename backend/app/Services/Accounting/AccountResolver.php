<?php

declare(strict_types=1);

namespace App\Services\Accounting;

use App\Models\Account;
use RuntimeException;

/**
 * Turns a system key, an id, or a model into a postable Account.
 *
 * Posting rules refer to accounts by stable keys ('inventory', 'cogs',
 * 'accounts_receivable'), never by id and never by name. That is what lets a
 * store owner renumber or rename their chart of accounts without breaking a
 * single line of posting code.
 */
class AccountResolver
{
    /** @var array<string, Account> */
    private array $cache = [];

    public function resolve(Account|int|string $account): Account
    {
        $resolved = match (true) {
            $account instanceof Account => $account,
            is_int($account) => $this->byId($account),
            default => $this->bySystemKey($account),
        };

        $this->assertPostable($resolved);

        return $resolved;
    }

    public function bySystemKey(string $key): Account
    {
        if (isset($this->cache[$key])) {
            return $this->cache[$key];
        }

        $account = Account::with('type')->firstWhere('system_key', $key);

        if ($account === null) {
            throw new RuntimeException(
                "No account is mapped to system key [{$key}]. ".
                'Run the ChartOfAccountsSeeder, or map an existing account to that key.'
            );
        }

        return $this->cache[$key] = $account;
    }

    public function byId(int $id): Account
    {
        $account = Account::with('type')->find($id);

        if ($account === null) {
            throw new RuntimeException("Account [{$id}] does not exist.");
        }

        return $account;
    }

    /**
     * Group accounts are report headers, and inactive accounts have been
     * retired. Posting to either would produce a balance nobody looks at.
     */
    private function assertPostable(Account $account): void
    {
        if ($account->is_group) {
            throw new RuntimeException(
                "Account [{$account->code} {$account->name}] is a group header and cannot be posted to directly."
            );
        }

        if (! $account->is_active) {
            throw new RuntimeException(
                "Account [{$account->code} {$account->name}] is inactive and cannot be posted to."
            );
        }
    }

    public function flush(): void
    {
        $this->cache = [];
    }
}
