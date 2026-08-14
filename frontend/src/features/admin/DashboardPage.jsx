import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, ArrowRight, Boxes, PackageX, ReceiptText, TrendingUp } from 'lucide-react'
import { get } from '../../lib/api'
import { cx, money } from '../../lib/format'
import { useAuthStore } from '../../stores/authStore'
import { Badge, ErrorState } from '../../components/ui'
import { statusTone } from '../checkout/orderStatus'

/**
 * The back office's front page.
 *
 * Two rules shape it. First, one hero figure and no competing display type --
 * the eye needs somewhere to land. Second, everything below the fold answers
 * "what do I do now", not "how is the business doing in general"; a dashboard
 * that only reports is a dashboard nobody opens twice.
 *
 * The money shown is DELIVERED money. Counting orders the moment they are
 * placed would flatter the shop by every parcel still on a courier's bike, and
 * on cash on delivery a real share of those come back. Orders in flight get
 * their own row, as a pipeline rather than as income.
 */

/** Compact figures: 1,284 / 12.9K / 4.2M. Never at the cost of the unit. */
function compact(value) {
  const n = Number(value ?? 0)

  if (Math.abs(n) >= 10_000_000) return `${(n / 10_000_000).toFixed(1)}Cr`
  if (Math.abs(n) >= 100_000) return `${(n / 100_000).toFixed(1)}L`
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}K`

  return n.toLocaleString('en-IN')
}

/**
 * Fourteen days of sales.
 *
 * One series, so no legend box: the heading already says what is plotted.
 * Sequential single hue, 2px line, hairline solid baseline, and only the
 * highest day is labelled -- a number on every point is chaos and goes
 * unread. Every value is still reachable: each day has a hover target, and
 * the figures below the chart carry the totals.
 */
function SalesTrend({ series }) {
  const points = series ?? []

  const { path, area, max, maxIndex, width, height } = useMemo(() => {
    const w = 100
    const h = 34
    const values = points.map((point) => Number(point.revenue))
    const peak = Math.max(...values, 1)
    const peakIndex = values.indexOf(Math.max(...values))

    const step = points.length > 1 ? w / (points.length - 1) : w

    const coords = values.map((value, index) => [
      index * step,
      // 2px of headroom so the peak's marker is never clipped by the top.
      h - 2 - (value / peak) * (h - 4),
    ])

    const line = coords.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`).join(' ')

    return {
      path: line,
      area: `${line} L${w},${h} L0,${h} Z`,
      max: peak,
      maxIndex: peakIndex,
      width: w,
      height: h,
    }
  }, [points])

  const total = points.reduce((sum, point) => sum + Number(point.revenue), 0)
  const hasSales = total > 0

  return (
    <section className="rounded-card border border-ink-200 bg-white p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-ink-900">Sales, last 14 days</h2>
        <p className="tabular text-sm text-ink-500">{money(total)} delivered</p>
      </div>

      {hasSales ? (
        <>
          <div className="relative mt-4">
            <svg
              viewBox={`0 0 ${width} ${height}`}
              preserveAspectRatio="none"
              className="h-28 w-full"
              role="img"
              aria-label={`Daily delivered sales for the last ${points.length} days. Highest day ${money(max)}.`}
            >
              <path d={area} fill="var(--color-brand-600)" opacity="0.10" />
              <path
                d={path}
                fill="none"
                stroke="var(--color-brand-600)"
                strokeWidth="0.7"
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            </svg>

            {/*
              A hover target per day, sized to the band rather than to the
              mark -- landing on a 2px line is not a hit target. Native title
              rather than a floating card: this is a sparkline, and a
              full tooltip layer would be more chrome than the figure earns.
            */}
            <div className="absolute inset-0 flex">
              {points.map((point) => (
                <div
                  key={point.date}
                  title={`${point.label}: ${money(point.revenue)} · ${point.orders} order${point.orders === 1 ? '' : 's'}`}
                  className="h-full flex-1 rounded transition-colors hover:bg-brand-50/60"
                />
              ))}
            </div>
          </div>

          <div className="mt-1 flex justify-between text-xs text-ink-400">
            <span>{points[0]?.label}</span>
            <span className="text-ink-500">
              Best day {money(max)} ({points[maxIndex]?.label})
            </span>
            <span>{points.at(-1)?.label}</span>
          </div>
        </>
      ) : (
        <p className="mt-6 pb-6 text-center text-sm text-ink-500">
          No delivered sales in the last 14 days yet.
        </p>
      )}
    </section>
  )
}

/**
 * A number with its meaning. Proportional figures, not tabular: equal-width
 * digits make a value like 121 look loose at this size.
 */
function Stat({ label, value, hint, tone = 'neutral', to, icon: Icon }) {
  const tones = {
    neutral: 'text-ink-900',
    warn: 'text-warning-700',
    bad: 'text-danger-700',
  }

  const body = (
    <div
      className={cx(
        'flex h-full flex-col justify-between rounded-card border border-ink-200 bg-white p-4 transition-colors',
        to && 'hover:border-brand-300',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-ink-500">{label}</p>
        {Icon && <Icon className="h-4 w-4 shrink-0 text-ink-300" aria-hidden="true" />}
      </div>

      <p className={cx('mt-3 text-2xl font-semibold leading-none', tones[tone])}>{value}</p>
      {hint && <p className="mt-1.5 text-xs text-ink-500">{hint}</p>}
    </div>
  )

  return to ? <Link to={to}>{body}</Link> : body
}

function Skeleton() {
  return (
    <div className="flex flex-col gap-5">
      <div className="h-32 animate-pulse rounded-card bg-ink-100" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="h-24 animate-pulse rounded-card bg-ink-100" />
        ))}
      </div>
      <div className="h-56 animate-pulse rounded-card bg-ink-100" />
    </div>
  )
}

export default function DashboardPage() {
  const can = useAuthStore((state) => state.can)
  const user = useAuthStore((state) => state.user)

  const query = useQuery({
    queryKey: ['admin', 'dashboard'],
    queryFn: () => get('/admin/dashboard'),
    select: (response) => response.data,
    // Held rather than skeleton-flashed on refetch, so the numbers never jump.
    placeholderData: (previous) => previous,
  })

  if (query.isLoading) return <Skeleton />
  if (query.isError) return <ErrorState error={query.error} onRetry={query.refetch} />

  const { today, month, pipeline, stock, trend, recent } = query.data
  const firstName = user?.name?.split(' ')[0] ?? 'there'

  const needsAttention = pipeline.orders > 0
  const stockTrouble = (stock?.out_of_stock ?? 0) + (stock?.low_stock ?? 0)

  return (
    <div className="flex flex-col gap-5">
      {/*
        One hero figure, and only one. Today's takings is the number a shop
        owner opens this page for; everything else is context around it.
      */}
      <section className="rounded-card border border-ink-200 bg-white p-5 sm:p-6">
        <p className="text-sm text-ink-500">
          Good day, {firstName}. Delivered today:
        </p>

        <p className="mt-2 text-[2.75rem] font-semibold leading-none text-ink-900 sm:text-5xl">
          {money(today.revenue)}
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-ink-600">
          <span>
            {today.orders} order{today.orders === 1 ? '' : 's'}
          </span>

          {can('accounting.view') && Number(today.gross_profit) !== 0 && (
            <span className="inline-flex items-center gap-1.5">
              <TrendingUp className="h-3.5 w-3.5 text-success-700" aria-hidden="true" />
              {money(today.gross_profit)} profit
            </span>
          )}

          <span className="text-ink-400">·</span>
          <span>{money(month.revenue)} this month</span>
        </div>
      </section>

      {/*
        What needs doing, before what has been done. A dashboard that leads
        with totals and buries the six orders waiting to be confirmed is a
        report, not a place of work.
      */}
      {needsAttention && (
        <section className="rounded-card border border-brand-200 bg-brand-50/60 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-ink-900">
                {pipeline.orders} order{pipeline.orders === 1 ? '' : 's'} in progress
              </h2>
              <p className="tabular mt-0.5 text-sm text-ink-600">
                {money(pipeline.value)} on its way to customers
              </p>
            </div>

            <Link
              to="/admin/orders?filter=open"
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700"
            >
              Open orders
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>

          <ul className="mt-3 grid gap-2 sm:grid-cols-4">
            {pipeline.stages.map((stage) => (
              <li key={stage.status}>
                <Link
                  to={`/admin/orders?status=${stage.status}`}
                  className={cx(
                    'block rounded-lg border bg-white px-3 py-2 transition-colors',
                    stage.orders > 0 ? 'border-ink-200 hover:border-brand-400' : 'border-ink-100 opacity-60',
                  )}
                >
                  <p className="text-xs text-ink-500">{stage.label}</p>
                  <p className="tabular mt-0.5 text-lg font-semibold leading-none text-ink-900">
                    {stage.orders}
                  </p>
                  <p className="tabular text-xs text-ink-500">{compact(stage.value)}</p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="This month"
          value={money(month.revenue)}
          hint={`${month.orders} order${month.orders === 1 ? '' : 's'} delivered`}
          icon={ReceiptText}
          to={can('orders.view') ? '/admin/orders?status=delivered' : undefined}
        />

        {can('accounting.view') && (
          <Stat
            label="Gross profit"
            value={money(month.gross_profit)}
            hint="This month, after cost of goods"
            icon={TrendingUp}
            to="/admin/reports/profit-loss"
          />
        )}

        {stock && (
          <>
            <Stat
              label="Stock value"
              value={money(stock.value)}
              hint={`${stock.tracked} item${stock.tracked === 1 ? '' : 's'} tracked`}
              icon={Boxes}
              to="/admin/inventory"
            />

            <Stat
              label="Needs restocking"
              value={stockTrouble}
              tone={stock.out_of_stock > 0 ? 'bad' : stock.low_stock > 0 ? 'warn' : 'neutral'}
              hint={
                stockTrouble === 0
                  ? 'Everything in stock'
                  : `${stock.out_of_stock} out, ${stock.low_stock} running low`
              }
              icon={stock.out_of_stock > 0 ? PackageX : AlertTriangle}
              to="/admin/inventory?filter=out"
            />
          </>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        {can('accounting.view') ? <SalesTrend series={trend} /> : <div />}

        <section className="rounded-card border border-ink-200 bg-white">
          <div className="flex items-center justify-between gap-2 border-b border-ink-100 p-4">
            <h2 className="text-sm font-semibold text-ink-900">Latest orders</h2>
            {can('orders.view') && (
              <Link to="/admin/orders" className="text-sm font-medium text-brand-600 hover:text-brand-700">
                All
              </Link>
            )}
          </div>

          {recent.length === 0 ? (
            <p className="p-4 text-sm text-ink-500">No orders yet.</p>
          ) : (
            <ul className="divide-y divide-ink-100">
              {recent.map((order) => (
                <li key={order.id}>
                  <Link
                    to={`/admin/orders/${order.id}`}
                    className="flex items-center gap-3 p-3 transition-colors hover:bg-ink-50"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink-900">{order.customer}</p>
                      <p className="tabular text-xs text-ink-500">
                        {order.number} · {order.district}
                      </p>
                    </div>

                    <span className="tabular shrink-0 text-sm font-medium text-ink-900">
                      {money(order.total)}
                    </span>

                    <Badge tone={statusTone(order.status)}>{order.status_label}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}
