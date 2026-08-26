import { useState } from 'react'
import { Cake, Gift, Minus, Plus, ShoppingBag, Star, Timer, UserCheck } from 'lucide-react'

import { cx } from '../../../lib/format'
import { Card, ErrorState, Pagination, Spinner } from '../../../components/ui'
import { useRewardHistory } from '../useRewardHistory'

/*
 * Reward points, lifted out of AccountPage into a panel of its own.
 *
 * It arrived on the branch as part of a single 300-line account screen,
 * which this side had already broken into one component per section. Kept
 * as its own file so it matches the rest of them rather than being the one
 * section that lives somewhere different.
 */

const TYPE_META = {
  purchase: { icon: ShoppingBag, shell: 'bg-success-50 text-success-700' },
  review: { icon: Star, shell: 'bg-success-50 text-success-700' },
  profile_completion: { icon: UserCheck, shell: 'bg-success-50 text-success-700' },
  birthday: { icon: Cake, shell: 'bg-success-50 text-success-700' },
  manual_credit: { icon: Plus, shell: 'bg-success-50 text-success-700' },
  manual_debit: { icon: Minus, shell: 'bg-danger-50 text-danger-700' },
  redeemed: { icon: Gift, shell: 'bg-brand-50 text-brand-700' },
  expired: { icon: Timer, shell: 'bg-ink-100 text-ink-500' },
}

const day = (iso) =>
  new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })

/*
 * How many whole days from now, so "expires in 6 days" can be said in a
 * different tone from "expires in 6 months".
 */
function daysUntil(iso) {
  return Math.ceil((new Date(iso) - Date.now()) / 86_400_000)
}

function RewardHistoryRow({ transaction }) {
  const meta = TYPE_META[transaction.type] ?? { icon: Gift, shell: 'bg-ink-100 text-ink-500' }
  const Icon = meta.icon
  const positive = transaction.points > 0

  return (
    <li className="flex items-center gap-3 border-b border-ink-100 py-3 last:border-0">
      <span className={cx('grid h-9 w-9 shrink-0 place-items-center rounded-full', meta.shell)}>
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-ink-900">{transaction.type_label}</p>
        <p className="mt-0.5 truncate text-xs text-ink-500">
          {transaction.note}
          {transaction.order_number && ` · Order ${transaction.order_number}`}
        </p>
        <p className="text-xs text-ink-400">
          {transaction.created_at ? day(transaction.created_at) : ''}
          {transaction.expires_at && ` · expires ${day(transaction.expires_at)}`}
        </p>
      </div>

      <span
        className={cx(
          'tabular shrink-0 text-sm font-bold',
          positive ? 'text-success-700' : 'text-danger-700',
        )}
      >
        {positive ? '+' : ''}
        {transaction.points}
      </span>
    </li>
  )
}

export function RewardsPanel() {
  const [page, setPage] = useState(1)
  const query = useRewardHistory(page)

  const balance = query.data?.balance ?? 0
  const rows = query.data?.data ?? []
  const next = query.data?.expiring_next ?? null

  // A month is the point at which "use them or lose them" is still useful
  // advice rather than an alarm about something a year away.
  const soon = next !== null && daysUntil(next.at) <= 30

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-3 p-4">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700">
          <Gift className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-500">Reward points</p>
          <p className="tabular text-xl font-bold text-ink-900">{balance}</p>
        </div>
      </div>

      {next && (
        <p
          className={cx(
            'flex items-center gap-2 border-t px-4 py-2.5 text-xs',
            soon
              ? 'border-warning-500 bg-warning-50 text-warning-700'
              : 'border-ink-100 text-ink-500',
          )}
        >
          <Timer className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>
            <strong className="font-semibold">{next.points}</strong>{' '}
            {next.points === 1 ? 'point expires' : 'points expire'} on{' '}
            <strong className="font-semibold">{day(next.at)}</strong>. The oldest are always spent
            first.
          </span>
        </p>
      )}

      <div className="border-t border-ink-100 px-4">
        {query.isLoading ? (
          <div className="grid place-items-center py-8">
            <Spinner />
          </div>
        ) : query.isError ? (
          <div className="py-4">
            <ErrorState error={query.error} onRetry={query.refetch} />
          </div>
        ) : rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-500">No point activity yet.</p>
        ) : (
          <ul>
            {rows.map((transaction) => (
              <RewardHistoryRow key={transaction.id} transaction={transaction} />
            ))}
          </ul>
        )}
      </div>

      {rows.length > 0 && (
        <div className="border-t border-ink-100 px-4">
          <Pagination meta={query.data?.meta} onPage={setPage} />
        </div>
      )}
    </Card>
  )
}
