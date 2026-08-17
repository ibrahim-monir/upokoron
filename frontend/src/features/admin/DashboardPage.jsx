import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Boxes,
  CheckCircle2,
  Clock3,
  PackageCheck,
  PackageX,
  ReceiptText,
  ShoppingBag,
  TrendingUp,
  Truck,
} from 'lucide-react'

import { get } from '../../lib/api'
import { cx, money } from '../../lib/format'
import { useAuthStore } from '../../stores/authStore'
import { Badge, ErrorState } from '../../components/ui'
import { statusTone } from '../checkout/orderStatus'


/* -------------------------------------------------------
   Helpers
------------------------------------------------------- */

function compact(value) {
  const n = Number(value ?? 0)

  if (Math.abs(n) >= 10_000_000) {
    return `${(n / 10_000_000).toFixed(1)}Cr`
  }

  if (Math.abs(n) >= 100_000) {
    return `${(n / 100_000).toFixed(1)}L`
  }

  if (Math.abs(n) >= 1_000) {
    return `${(n / 1_000).toFixed(1)}K`
  }

  return n.toLocaleString('en-IN')
}


/* -------------------------------------------------------
   KPI Card
------------------------------------------------------- */

function KpiCard({
  label,
  value,
  hint,
  icon: Icon,
  iconClass = 'bg-blue-50 text-blue-600',
  href,
  trend,
  trendText,
}) {
  const content = (
    <div className="group h-full rounded-xl border border-slate-200 bg-white p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div
          className={cx(
            'grid h-10 w-10 shrink-0 place-items-center rounded-xl',
            iconClass,
          )}
        >
          <Icon className="h-5 w-5" aria-hidden="true" />
        </div>

        {trend && (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600">
            <ArrowUpRight className="h-3 w-3" />
            {trendText ?? '18%'}
          </span>
        )}
      </div>

      <p className="mt-4 text-[11px] font-medium uppercase tracking-wide text-slate-500">
        {label}
      </p>

      <p className="mt-1 text-[24px] font-semibold leading-tight tracking-tight text-slate-900">
        {value}
      </p>

      {hint && (
        <p className="mt-1 text-[11px] text-slate-500">
          {hint}
        </p>
      )}
    </div>
  )

  return href ? (
    <Link to={href} className="block">
      {content}
    </Link>
  ) : (
    content
  )
}


/* -------------------------------------------------------
   Sales Chart
------------------------------------------------------- */

function SalesChart({ series }) {
  const points = series ?? []

  const maxValue = useMemo(() => {
    return Math.max(
      ...points.map((item) => Number(item.revenue ?? 0)),
      1,
    )
  }, [points])

  const total = points.reduce(
    (sum, item) => sum + Number(item.revenue ?? 0),
    0,
  )

  const bestDay = useMemo(() => {
    if (!points.length) return null

    return points.reduce((best, item) => {
      return Number(item.revenue ?? 0) >
        Number(best?.revenue ?? 0)
        ? item
        : best
    }, points[0])
  }, [points])

  return (
    <section className="rounded-xl border border-slate-200 bg-white">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 px-5 py-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-blue-600" />

            <h2 className="text-sm font-semibold text-slate-900">
              Sales overview
            </h2>
          </div>

          <p className="mt-1 text-[11px] text-slate-500">
            Delivered revenue · Last 14 days
          </p>
        </div>

        <div className="text-right">
          <p className="text-lg font-semibold text-slate-900">
            {money(total)}
          </p>

          <p className="text-[10px] text-slate-400">
            14-day total
          </p>
        </div>
      </div>

      {/* Chart */}
      <div className="px-5 pb-4 pt-6">
        {points.length > 0 ? (
          <>
            <div className="relative h-[245px]">
              {/* Grid */}
              <div className="pointer-events-none absolute inset-0 flex flex-col justify-between">
                {[400, 300, 200, 100, 0].map((value) => (
                  <div
                    key={value}
                    className="flex items-center gap-3"
                  >
                    <span className="w-7 text-[9px] text-slate-400">
                      {value}K
                    </span>

                    <div className="h-px flex-1 border-t border-dashed border-slate-200" />
                  </div>
                ))}
              </div>

              {/* Bars */}
              <div className="absolute bottom-0 left-10 right-0 top-2 flex items-end justify-between gap-1">
                {points.map((point) => {
                  const value = Number(point.revenue ?? 0)

                  const height = Math.max(
                    3,
                    (value / maxValue) * 190,
                  )

                  return (
                    <div
                      key={point.date}
                      className="group relative flex h-full flex-1 items-end justify-center"
                    >
                      {/* Tooltip */}
                      <div className="pointer-events-none absolute bottom-[calc(100%-190px)] left-1/2 z-10 hidden -translate-x-1/2 rounded-md bg-slate-900 px-2 py-1 text-[10px] whitespace-nowrap text-white shadow-lg group-hover:block">
                        {point.label}: {money(value)}
                      </div>

                      <div
                        style={{ height }}
                        className="w-[55%] min-w-[4px] max-w-[12px] rounded-t-sm bg-blue-600 transition-all duration-200 group-hover:bg-blue-700"
                      />
                    </div>
                  )
                })}
              </div>
            </div>

            {/* X Axis */}
            <div className="ml-10 mt-2 flex justify-between text-[9px] text-slate-400">
              <span>{points[0]?.label}</span>

              {bestDay && (
                <span className="hidden text-slate-500 sm:block">
                  Best day {money(bestDay.revenue)} · {bestDay.label}
                </span>
              )}

              <span>{points.at(-1)?.label}</span>
            </div>
          </>
        ) : (
          <div className="grid h-[245px] place-items-center text-sm text-slate-400">
            No sales data available.
          </div>
        )}
      </div>
    </section>
  )
}


/* -------------------------------------------------------
   Pipeline Card
------------------------------------------------------- */

function PipelineCard({ stages }) {
  const stageIcons = {
    pending: Clock3,
    confirmed: CheckCircle2,
    processing: PackageCheck,
    shipped: Truck,
    delivered: CheckCircle2,
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white">
      <div className="border-b border-slate-100 px-5 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              Order pipeline
            </h2>

            <p className="mt-1 text-[11px] text-slate-500">
              Current order status overview
            </p>
          </div>

          <Link
            to="/admin/orders"
            className="text-xs font-medium text-blue-600 hover:text-blue-700"
          >
            View all →
          </Link>
        </div>
      </div>

      <div className="divide-y divide-slate-100">
        {(stages ?? []).map((stage) => {
          const Icon =
            stageIcons[stage.status] ?? PackageCheck

          return (
            <Link
              key={stage.status}
              to={`/admin/orders?status=${stage.status}`}
              className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-slate-50"
            >
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-500">
                <Icon className="h-4 w-4" />
              </div>

              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-slate-800">
                  {stage.label}
                </p>

                <p className="mt-0.5 text-[10px] text-slate-400">
                  {compact(stage.value)}
                </p>
              </div>

              <p className="text-sm font-semibold text-slate-900">
                {stage.orders}
              </p>
            </Link>
          )
        })}
      </div>
    </section>
  )
}


/* -------------------------------------------------------
   Latest Orders
------------------------------------------------------- */

function LatestOrders({ orders }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">
            Latest orders
          </h2>

          <p className="mt-1 text-[11px] text-slate-500">
            Most recent customer activity
          </p>
        </div>

        <Link
          to="/admin/orders"
          className="text-xs font-medium text-blue-600 hover:text-blue-700"
        >
          View all →
        </Link>
      </div>

      {orders?.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px]">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/60">
                <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  Customer
                </th>

                <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  Order
                </th>

                <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  Location
                </th>

                <th className="px-4 py-3 text-right text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  Amount
                </th>

                <th className="px-4 py-3 text-right text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  Status
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {orders.slice(0, 6).map((order) => (
                <tr
                  key={order.id}
                  className="transition-colors hover:bg-slate-50"
                >
                  <td className="px-4 py-3">
                    <Link
                      to={`/admin/orders/${order.id}`}
                      className="text-xs font-medium text-slate-900 hover:text-blue-600"
                    >
                      {order.customer}
                    </Link>
                  </td>

                  <td className="px-4 py-3 text-[11px] text-slate-500">
                    {order.number}
                  </td>

                  <td className="px-4 py-3 text-[11px] text-slate-500">
                    {order.district}
                  </td>

                  <td className="px-4 py-3 text-right text-xs font-semibold text-slate-900">
                    {money(order.total)}
                  </td>

                  <td className="px-4 py-3 text-right">
                    <Badge tone={statusTone(order.status)}>
                      {order.status_label}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="p-8 text-center text-sm text-slate-400">
          No orders yet.
        </div>
      )}
    </section>
  )
}


/* -------------------------------------------------------
   Skeleton
------------------------------------------------------- */

function Skeleton() {
  return (
    <div className="space-y-5">
      <div className="h-10 w-48 animate-pulse rounded bg-slate-200" />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
        {Array.from({ length: 10 }).map((_, index) => (
          <div
            key={index}
            className="h-32 animate-pulse rounded-xl bg-slate-200"
          />
        ))}
      </div>

      <div className="h-80 animate-pulse rounded-xl bg-slate-200" />
    </div>
  )
}


/* -------------------------------------------------------
   Dashboard
------------------------------------------------------- */

export default function DashboardPage() {
  const can = useAuthStore((state) => state.can)
  const user = useAuthStore((state) => state.user)

  const query = useQuery({
    queryKey: ['admin', 'dashboard'],
    queryFn: () => get('/admin/dashboard'),
    select: (response) => response.data,
    placeholderData: (previous) => previous,
  })

  if (query.isLoading) {
    return <Skeleton />
  }

  if (query.isError) {
    return (
      <ErrorState
        error={query.error}
        onRetry={query.refetch}
      />
    )
  }

  const {
    today,
    month,
    pipeline,
    stock,
    trend,
    recent,
  } = query.data

  const firstName =
    user?.name?.split(' ')[0] ?? 'there'

  const stockTrouble =
    Number(stock?.out_of_stock ?? 0) +
    Number(stock?.low_stock ?? 0)

  const deliveredStage =
    pipeline?.stages?.find(
      (stage) => stage.status === 'delivered',
    )

  return (
    <div className="min-h-full bg-slate-50">
      {/* -------------------------------------------------
          Header
      ------------------------------------------------- */}
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Dashboard
          </h1>

          <div className="mt-1 flex items-center gap-1.5 text-[10px] text-slate-400">
            <span>dashboard</span>
            <span>/</span>
            <span className="text-blue-600">
              dashboard
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            className="flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-600 shadow-sm"
          >
            <span>Dec 20, 2023 - Jan 4, 2024</span>
          </button>

          <button
            type="button"
            className="flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-600 shadow-sm"
          >
            Monthly
            <span className="text-[9px]">⌄</span>
          </button>
        </div>
      </div>


      {/* -------------------------------------------------
          KPI ROW 1
      ------------------------------------------------- */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">

        <KpiCard
          label="Today's earning"
          value={money(today.revenue)}
          hint="Delivered revenue"
          icon={TrendingUp}
          iconClass="bg-emerald-50 text-emerald-600"
          trend
        />

        {can('accounting.view') && (
          <KpiCard
            label="Gross profit"
            value={money(month.gross_profit)}
            hint="After cost of goods"
            icon={TrendingUp}
            iconClass="bg-blue-50 text-blue-600"
            trend
          />
        )}

        <KpiCard
          label="Total orders"
          value={month.orders}
          hint="Delivered this month"
          icon={ShoppingBag}
          iconClass="bg-orange-50 text-orange-600"
          href="/admin/orders"
        />

        {stock && (
          <KpiCard
            label="Inventory value"
            value={money(stock.value)}
            hint={`${stock.tracked} items tracked`}
            icon={Boxes}
            iconClass="bg-emerald-50 text-emerald-600"
            href="/admin/inventory"
          />
        )}

        {stock && (
          <KpiCard
            label="Out of stock"
            value={stock.out_of_stock}
            hint={
              stock.out_of_stock > 0
                ? 'Needs attention'
                : 'Everything is in stock'
            }
            icon={PackageX}
            iconClass={
              stock.out_of_stock > 0
                ? 'bg-red-50 text-red-600'
                : 'bg-slate-100 text-slate-500'
            }
            href="/admin/inventory?filter=out"
          />
        )}
      </div>


      {/* -------------------------------------------------
          KPI ROW 2
      ------------------------------------------------- */}
      <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">

        <KpiCard
          label="Waiting for confirmation"
          value={
            pipeline?.stages?.find(
              (stage) =>
                stage.status === 'pending',
            )?.orders ?? 0
          }
          hint="Customer orders"
          icon={Clock3}
          iconClass="bg-orange-50 text-orange-600"
          href="/admin/orders?status=pending"
        />

        <KpiCard
          label="Processing orders"
          value={
            pipeline?.stages?.find(
              (stage) =>
                stage.status === 'processing',
            )?.orders ?? 0
          }
          hint="Currently processing"
          icon={PackageCheck}
          iconClass="bg-blue-50 text-blue-600"
          href="/admin/orders?status=processing"
        />

        <KpiCard
          label="Ready for delivery"
          value={
            pipeline?.stages?.find(
              (stage) =>
                stage.status === 'ready',
            )?.orders ?? 0
          }
          hint="Ready to ship"
          icon={Truck}
          iconClass="bg-lime-50 text-lime-600"
          href="/admin/orders"
        />

        <KpiCard
          label="Delivered orders"
          value={
            deliveredStage?.orders ??
            today.orders ??
            0
          }
          hint="Completed successfully"
          icon={CheckCircle2}
          iconClass="bg-cyan-50 text-cyan-600"
          href="/admin/orders?status=delivered"
        />

        <KpiCard
          label="Needs restocking"
          value={stockTrouble}
          hint={
            stockTrouble
              ? `${stock?.out_of_stock ?? 0} out of stock`
              : 'Everything is healthy'
          }
          icon={AlertTriangle}
          iconClass={
            stockTrouble
              ? 'bg-red-50 text-red-600'
              : 'bg-emerald-50 text-emerald-600'
          }
          href="/admin/inventory"
        />
      </div>


      {/* -------------------------------------------------
          Sales Chart
      ------------------------------------------------- */}
      <div className="mt-5">
        {can('accounting.view') && (
          <SalesChart series={trend} />
        )}
      </div>


      {/* -------------------------------------------------
          Bottom Tables
      ------------------------------------------------- */}
      <div className="mt-4 grid gap-4 xl:grid-cols-[1.55fr_1fr]">

        <LatestOrders orders={recent} />

        <PipelineCard
          stages={pipeline?.stages}
        />

      </div>
    </div>
  )
}