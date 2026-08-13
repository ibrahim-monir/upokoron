import { useMemo, useState } from 'react'
import { BookOpen, Lock, Search } from 'lucide-react'
import { useList } from './useResource'
import { cx, money } from '../../lib/format'
import {
  Badge,
  Card,
  EmptyState,
  ErrorState,
  Input,
  Select,
  Spinner,
  TableWrap,
  Td,
  Th,
} from '../../components/ui'

const CATEGORY_LABELS = {
  asset: 'Assets',
  liability: 'Liabilities',
  equity: 'Equity',
  revenue: 'Revenue',
  cogs: 'Cost of goods sold',
  expense: 'Expenses',
}

export default function AccountsPage() {
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')

  const query = useList('admin.accounts', '/admin/accounts', { with_balance: 1 })

  const accounts = query.data?.data ?? []

  const filtered = useMemo(() => {
    return accounts.filter((account) => {
      if (category && account.type?.category !== category) return false

      if (!search) return true

      const term = search.toLowerCase()
      return account.name.toLowerCase().includes(term) || account.code.includes(term)
    })
  }, [accounts, search, category])

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-ink-900">Chart of accounts</h1>
        <p className="mt-0.5 text-sm text-ink-500">
          Accounts marked with a lock are wired into posting rules. They can be renamed, but not
          retyped or deleted.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-56 flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400"
            aria-hidden="true"
          />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by name or code"
            aria-label="Search accounts"
            className="pl-9"
          />
        </div>

        <Select
          value={category}
          onChange={(event) => setCategory(event.target.value)}
          aria-label="Filter by category"
          className="w-52"
        >
          <option value="">All categories</option>
          {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </div>

      {query.isError && <ErrorState error={query.error} onRetry={query.refetch} />}

      {query.isLoading ? (
        <div className="grid place-items-center py-16">
          <Spinner />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={BookOpen} title="No accounts matched" />
      ) : (
        <TableWrap>
          <thead>
            <tr>
              <Th>Code</Th>
              <Th>Account</Th>
              <Th>Category</Th>
              <Th>Normal</Th>
              <Th numeric>Balance</Th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((account) => (
              <tr key={account.id} className={cx('hover:bg-ink-50', account.is_group && 'bg-ink-50/60')}>
                <Td className="tabular text-ink-500">{account.code}</Td>
                <Td>
                  <span
                    className={cx(account.is_group ? 'font-semibold text-ink-900' : 'text-ink-800')}
                    style={{ paddingLeft: account.is_group ? 0 : '14px' }}
                  >
                    {account.name}
                  </span>
                  {account.is_system && (
                    <span
                      title="Wired into posting rules"
                      className="ml-2 inline-flex align-middle text-ink-400"
                    >
                      <Lock className="h-3 w-3" aria-label="System account" />
                    </span>
                  )}
                </Td>
                <Td>
                  <Badge tone="neutral">{account.type?.category_label}</Badge>
                </Td>
                <Td className="text-ink-500">{account.type?.normal_balance}</Td>
                <Td numeric className="font-medium">
                  {account.is_group ? '—' : money(account.balance ?? 0)}
                </Td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}
    </div>
  )
}
