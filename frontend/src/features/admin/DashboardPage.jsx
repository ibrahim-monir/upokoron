import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { AlertTriangle, Boxes, PackageX, TrendingUp, Wallet } from 'lucide-react'
import { get } from '../../lib/api'
import { cx, money } from '../../lib/format'
import { useAuthStore } from '../../stores/authStore'
import { Card, CardHeader, ErrorState, Spinner } from '../../components/ui'

/**
 * A number with its meaning, not a number alone. Severity is carried by form
 * as well as by the figure, so what needs attention reads at a glance.
 */
function StatTile({ icon: Icon, label, value, hint, tone = 'neutral', to, loading }) {
  const tones = {
    neutral: 'text-ink-900',
    good: 'text-success-700',
    warn: 'text-warning-700',
    bad: 'text-danger-700',
  }

  const body = (
    <Card className={cx('p-4 transition-shadow', to && 'hover:shadow-raised')}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-500">{label}</p>
          {loading ? (
            <div className="mt-2 h-7 w-24 animate-pulse rounded bg-ink-100" />
          ) : (
            <p className={cx('tabular mt-1 text-2xl font-semibold', tones[tone])}>{value}</p>
          )}
          {hint && <p className="mt-1 text-xs text-ink-500">{hint}</p>}
        </div>

        <span
          className={cx(
            'grid h-9 w-9 shrink-0 place-items-center rounded-lg',
            tone === 'bad' ? 'bg-danger-50 text-danger-700'
              : tone === 'warn' ? 'bg-warning-50 text-warning-700'
              : 'bg-brand-50 text-brand-700',
          )}
        >
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
      </div>
    </Card>
  )

  return to ? <Link to={to}>{body}</Link> : body
}

export default function DashboardPage() {
  const can = useAuthStore((state) => state.can)
  const user = useAuthStore((state) => state.user)

  const inventory = useQuery({
    queryKey: ['admin', 'inventory', 'summary'],
    queryFn: () => get('/admin/inventory', { params: { per_page: 1 } }),
    enabled: can('inventory.view'),
  })

  const profit = useQuery({
    queryKey: ['admin', 'reports', 'profit-loss', 'dashboard'],
    queryFn: () => get('/admin/reports/profit-loss'),
    enabled: can('accounting.view'),
  })

  const products = useQuery({
    queryKey: ['admin', 'products', 'count'],
    queryFn: () => get('/admin/products', { params: { per_page: 1 } }),
    enabled: can('products.view'),
  })

  const summary = inventory.data?.summary

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink-900">
          Good to see you, {user?.name?.split(' ')[0]}
        </h1>
        <p className="mt-1 text-sm text-ink-500">
          Everything below is live from the database. Sales figures arrive with the orders module.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {can('products.view') && (
          <StatTile
            icon={Boxes}
            label="Products"
            value={products.data?.meta?.total ?? 0}
            loading={products.isLoading}
            to="/admin/products"
          />
        )}

        {can('inventory.view') && (
          <>
            <StatTile
              icon={Wallet}
              label="Stock value"
              value={money(summary?.stock_value ?? 0)}
              hint={`${summary?.tracked_items ?? 0} tracked item(s)`}
              loading={inventory.isLoading}
              to="/admin/inventory"
            />
            <StatTile
              icon={AlertTriangle}
              label="Low stock"
              value={summary?.low_stock ?? 0}
              hint="At or below reorder level"
              tone={summary?.low_stock > 0 ? 'warn' : 'neutral'}
              loading={inventory.isLoading}
              to="/admin/inventory?filter=low"
            />
            <StatTile
              icon={PackageX}
              label="Out of stock"
              value={summary?.out_of_stock ?? 0}
              hint="Nothing available to sell"
              tone={summary?.out_of_stock > 0 ? 'bad' : 'good'}
              loading={inventory.isLoading}
              to="/admin/inventory?filter=out"
            />
          </>
        )}
      </div>

      {can('accounting.view') && (
        <Card>
          <CardHeader
            title="Profit and loss"
            description="From the general ledger, for the whole period on record."
            actions={
              <Link
                to="/admin/reports/profit-loss"
                className="text-sm font-medium text-brand-700 hover:underline"
              >
                Full report
              </Link>
            }
          />

          {profit.isLoading ? (
            <div className="grid place-items-center p-10">
              <Spinner />
            </div>
          ) : profit.isError ? (
            <div className="p-4">
              <ErrorState error={profit.error} onRetry={profit.refetch} />
            </div>
          ) : (
            <dl className="grid gap-px bg-ink-200 sm:grid-cols-4">
              {[
                { label: 'Net sales', value: profit.data?.net_sales, tone: 'neutral' },
                { label: 'Cost of goods sold', value: profit.data?.cost_of_goods_sold, tone: 'neutral' },
                { label: 'Gross profit', value: profit.data?.gross_profit, tone: 'good' },
                { label: 'Net profit', value: profit.data?.net_profit, tone: 'good' },
              ].map(({ label, value, tone }) => (
                <div key={label} className="bg-white p-4">
                  <dt className="text-xs font-medium uppercase tracking-wide text-ink-500">{label}</dt>
                  <dd
                    className={cx(
                      'tabular mt-1 text-xl font-semibold',
                      tone === 'good' && Number(value) > 0 ? 'text-success-700' : 'text-ink-900',
                    )}
                  >
                    {money(value ?? 0)}
                  </dd>
                </div>
              ))}
            </dl>
          )}

          {profit.data && (
            <p className="flex items-center gap-1.5 border-t border-ink-200 px-4 py-2.5 text-xs text-ink-500">
              <TrendingUp className="h-3.5 w-3.5" aria-hidden="true" />
              Gross margin {profit.data.gross_margin_percent}%
            </p>
          )}
        </Card>
      )}
    </div>
  )
}
