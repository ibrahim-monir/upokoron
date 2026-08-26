import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Boxes,
  CheckCircle2,
  Clock3,
  Cog,
  FolderTree,
  GalleryHorizontal,
  Gift,
  HelpCircle,
  Images,
  MessageSquare,
  Navigation,
  Package,
  PackageCheck,
  PauseCircle,
  RefreshCw,
  ShieldCheck,
  ShoppingBag,
  Star,
  Tag,
  Ticket,
  Truck,
  Users,
  Wallet,
} from 'lucide-react'

import { get } from '../../lib/api'
import { cx, money, relativeTime } from '../../lib/format'
import { useAuthStore } from '../../stores/authStore'
import { Badge, ErrorState } from '../../components/ui'
import { statusTone } from '../checkout/orderStatus'

const TZ = 'Asia/Dhaka'


/* -------------------------------------------------------
   Numbers
------------------------------------------------------- */

/**
 * Short form for figures that have to fit in an axis tick or a chip.
 *
 * Lakh and crore, not million: the people reading this dashboard count in
 * the units the rest of the country counts in, and "1.2M" makes them do
 * arithmetic before they can read their own week.
 */
function compact(value) {
  const n = Number(value ?? 0)

  if (Math.abs(n) >= 10_000_000) return `${(n / 10_000_000).toFixed(1)}Cr`
  if (Math.abs(n) >= 100_000) return `${(n / 100_000).toFixed(1)}L`
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}K`

  return n.toLocaleString('en-IN')
}

function compactTaka(value) {
  return `৳${compact(value)}`
}

/** Whole taka. Poisha on a dashboard figure is noise nobody acts on. */
function round(value) {
  return money(value, { decimals: 0 })
}

function sumRevenue(rows) {
  return (rows ?? []).reduce((total, row) => total + Number(row.revenue ?? 0), 0)
}

/**
 * A period-over-period change, or nothing at all.
 *
 * Returns null when the earlier period was zero: there is no percentage
 * change from nothing, and inventing one dresses a first sale up as growth.
 * A missing delta is honest; the hardcoded "18%" this replaced was not.
 */
function changeBetween(current, previous) {
  const now = Number(current ?? 0)
  const before = Number(previous ?? 0)

  if (!before) return null

  return ((now - before) / before) * 100
}


/* -------------------------------------------------------
   Delta pill
------------------------------------------------------- */

function Delta({ change, since, onDark = false }) {
  if (change === null || change === undefined) {
    return since ? (
      <span className={cx('text-[11px]', onDark ? 'text-white/40' : 'text-ink-400')}>
        no {since} to compare against
      </span>
    ) : null
  }

  const up = change >= 0
  const Icon = up ? ArrowUpRight : ArrowDownRight

  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5',
        'text-[11px] font-semibold tabular',
        onDark
          ? up
            ? 'bg-accent-400/15 text-accent-300'
            : 'bg-danger-500/20 text-danger-300'
          : up
            ? 'bg-accent-50 text-accent-700'
            : 'bg-danger-50 text-danger-700',
      )}
    >
      <Icon className="h-3 w-3" aria-hidden="true" />
      {Math.abs(change).toFixed(1)}%
      {since && (
        <span className={cx('font-normal', onDark ? 'text-white/45' : 'text-ink-500')}>
          vs {since}
        </span>
      )}
    </span>
  )
}


/* -------------------------------------------------------
   Measurement
------------------------------------------------------- */

/**
 * The chart is drawn in real pixels rather than scaled from a fixed
 * viewBox: a scaled SVG shrinks its own axis text on a phone until it is
 * unreadable, and fattens the stroke on a wide monitor.
 */
function useElementWidth() {
  const ref = useRef(null)
  const [width, setWidth] = useState(0)

  useEffect(() => {
    const node = ref.current
    if (!node) return undefined

    const observer = new ResizeObserver(([entry]) => {
      setWidth(entry.contentRect.width)
    })

    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  return [ref, width]
}


/* -------------------------------------------------------
   Revenue chart
------------------------------------------------------- */

const CHART_HEIGHT = 268
const PAD = { top: 22, right: 20, bottom: 26, left: 58 }

/**
 * Axis ticks on numbers a human would have chosen.
 *
 * The chart this replaces labelled its gridlines 0/100K/200K/300K/400K no
 * matter what the bars were, so the axis and the data disagreed on every
 * day the shop did not happen to take four lakh taka.
 */
function niceTicks(max, count = 4) {
  if (!(max > 0)) return [0, 1]

  const rough = max / count
  const magnitude = 10 ** Math.floor(Math.log10(rough))
  const step =
    [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= rough) ?? magnitude * 10

  const ceiling = Math.ceil(max / step) * step
  const ticks = []

  for (let value = 0; value <= ceiling + step / 2; value += step) ticks.push(value)

  return ticks
}

function RevenueChart({ series }) {
  const [wrapRef, width] = useElementWidth()
  const [hover, setHover] = useState(null)
  const [showTable, setShowTable] = useState(false)

  // Stable across renders, so the memos below actually memoize.
  const points = useMemo(() => series ?? [], [series])
  const total = sumRevenue(points)

  const ticks = useMemo(
    () => niceTicks(Math.max(...points.map((point) => Number(point.revenue ?? 0)), 0)),
    [points],
  )

  const ceiling = ticks.at(-1) || 1
  const innerW = Math.max(width - PAD.left - PAD.right, 0)
  const innerH = CHART_HEIGHT - PAD.top - PAD.bottom
  const baseline = PAD.top + innerH

  const x = (index) =>
    PAD.left + (points.length > 1 ? (innerW * index) / (points.length - 1) : innerW / 2)

  const y = (value) => PAD.top + innerH * (1 - Number(value ?? 0) / ceiling)

  const peak = useMemo(() => {
    if (!points.length) return -1

    return points.reduce(
      (best, point, index) =>
        Number(point.revenue ?? 0) > Number(points[best].revenue ?? 0) ? index : best,
      0,
    )
  }, [points])

  const linePath = points
    .map((point, index) => `${index ? 'L' : 'M'}${x(index)},${y(point.revenue)}`)
    .join(' ')

  const areaPath = points.length
    ? `${linePath} L${x(points.length - 1)},${baseline} L${x(0)},${baseline} Z`
    : ''

  const active = hover === null ? null : points[hover]
  const hasPlot = total > 0 && points.length > 1 && width > 0

  function trackPointer(event) {
    if (!innerW || points.length < 2) return

    const bounds = event.currentTarget.getBoundingClientRect()
    const ratio = (event.clientX - bounds.left - PAD.left) / innerW
    const index = Math.round(ratio * (points.length - 1))

    setHover(Math.min(points.length - 1, Math.max(0, index)))
  }

  return (
    <section className="flex flex-col rounded-2xl border border-ink-200 bg-white shadow-card">
      <header className="flex flex-wrap items-start justify-between gap-4 px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold text-ink-900">Revenue trend</h2>
          <p className="mt-0.5 text-xs text-ink-500">Delivered sales, last 14 days</p>
        </div>

        <div className="text-right">
          <p className="text-lg font-semibold tracking-tight text-ink-900">{round(total)}</p>
          <p className="text-[11px] text-ink-400">14-day total</p>
        </div>
      </header>

      <div ref={wrapRef} className="relative px-2">
        {total > 0 && points.length > 1 ? (
          <>
            {hasPlot && (
              <svg
                width={width}
                height={CHART_HEIGHT}
                role="img"
                aria-label={`Delivered revenue over the last 14 days, ${round(total)} in total`}
                onMouseMove={trackPointer}
                onMouseLeave={() => setHover(null)}
                className="block select-none"
              >
                <defs>
                  <linearGradient id="revenue-wash" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-brand-600)" stopOpacity="0.18" />
                    <stop offset="100%" stopColor="var(--color-brand-600)" stopOpacity="0" />
                  </linearGradient>
                </defs>

                {/* Gridlines: solid hairlines, one step off the surface. */}
                {ticks.map((tick) => (
                  <g key={tick}>
                    <line
                      x1={PAD.left}
                      x2={PAD.left + innerW}
                      y1={y(tick)}
                      y2={y(tick)}
                      stroke="var(--color-ink-200)"
                      strokeWidth="1"
                    />
                    <text
                      x={PAD.left - 10}
                      y={y(tick) + 3.5}
                      textAnchor="end"
                      className="fill-ink-400 tabular"
                      fontSize="10"
                    >
                      {compactTaka(tick)}
                    </text>
                  </g>
                ))}

                <path d={areaPath} fill="url(#revenue-wash)" />

                <path
                  d={linePath}
                  fill="none"
                  stroke="var(--color-brand-600)"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />

                {/* Day labels thin out rather than collide. */}
                {points.map((point, index) =>
                  index % 3 === 0 || index === points.length - 1 ? (
                    <text
                      key={point.date}
                      x={x(index)}
                      y={CHART_HEIGHT - 8}
                      textAnchor={
                        index === 0 ? 'start' : index === points.length - 1 ? 'end' : 'middle'
                      }
                      className="fill-ink-400"
                      fontSize="10"
                    >
                      {point.label}
                    </text>
                  ) : null,
                )}

                {/* The best day is the one number worth writing on the plot. */}
                {peak >= 0 && hover === null && (
                  <text
                    x={x(peak)}
                    y={y(points[peak].revenue) - 13}
                    textAnchor={
                      peak === 0 ? 'start' : peak === points.length - 1 ? 'end' : 'middle'
                    }
                    className="fill-ink-700 tabular"
                    fontSize="11"
                    fontWeight="600"
                  >
                    {compactTaka(points[peak].revenue)}
                  </text>
                )}

                {peak >= 0 && (
                  <circle
                    cx={x(peak)}
                    cy={y(points[peak].revenue)}
                    r="4"
                    fill="var(--color-brand-600)"
                    stroke="#ffffff"
                    strokeWidth="2"
                  />
                )}

                {active && (
                  <g>
                    <line
                      x1={x(hover)}
                      x2={x(hover)}
                      y1={PAD.top}
                      y2={baseline}
                      stroke="var(--color-ink-300)"
                      strokeWidth="1"
                    />
                    <circle
                      cx={x(hover)}
                      cy={y(active.revenue)}
                      r="4.5"
                      fill="var(--color-brand-600)"
                      stroke="#ffffff"
                      strokeWidth="2"
                    />
                  </g>
                )}
              </svg>
            )}

            {active && (
              <div
                style={{
                  left: Math.min(Math.max(x(hover), 74), Math.max(width - 74, 74)),
                  top: y(active.revenue) - 14,
                }}
                className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg bg-ink-900 px-2.5 py-1.5 text-center shadow-raised"
              >
                <p className="text-[11px] font-semibold text-white tabular">
                  {round(active.revenue)}
                </p>
                <p className="text-[10px] text-white/60">
                  {active.label} · {active.orders} order{active.orders === 1 ? '' : 's'}
                </p>
              </div>
            )}
          </>
        ) : (
          <div className="grid text-center" style={{ height: CHART_HEIGHT }}>
            <div className="self-center">
              <p className="text-sm font-medium text-ink-600">No delivered sales yet</p>
              <p className="mt-1 text-xs text-ink-400">
                The trend fills in as orders reach delivered.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* The plot is a picture; the numbers behind it stay reachable. */}
      {total > 0 && (
        <div className="border-t border-ink-100 px-5 py-2.5">
          <button
            type="button"
            onClick={() => setShowTable((open) => !open)}
            aria-expanded={showTable}
            className="text-[11px] font-semibold text-ink-500 transition hover:text-brand-700"
          >
            {showTable ? 'Hide the numbers' : 'Show the numbers'}
          </button>

          {showTable && (
            <div className="mt-3 max-h-56 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-white">
                  <tr className="text-ink-500">
                    <th scope="col" className="py-1.5 text-left font-semibold">
                      Day
                    </th>
                    <th scope="col" className="py-1.5 text-right font-semibold">
                      Orders
                    </th>
                    <th scope="col" className="py-1.5 text-right font-semibold">
                      Revenue
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {points.map((point) => (
                    <tr key={point.date}>
                      <td className="py-1.5 text-ink-700">{point.label}</td>
                      <td className="py-1.5 text-right text-ink-700 tabular">{point.orders}</td>
                      <td className="py-1.5 text-right font-medium text-ink-900 tabular">
                        {round(point.revenue)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </section>
  )
}


/* -------------------------------------------------------
   Hero band
------------------------------------------------------- */

function Sparkline({ series }) {
  const points = series ?? []
  const values = points.map((point) => Number(point.revenue ?? 0))
  const max = Math.max(...values, 1)

  if (points.length < 2) return null

  const path = values
    .map((value, index) => {
      const px = (index / (values.length - 1)) * 100
      const py = 30 - (value / max) * 26

      return `${index ? 'L' : 'M'}${px},${py}`
    })
    .join(' ')

  return (
    <svg viewBox="0 0 100 32" preserveAspectRatio="none" aria-hidden="true" className="h-9 w-full">
      <path d={`${path} L100,32 L0,32 Z`} fill="var(--color-brand-500)" fillOpacity="0.16" />
      <path
        d={path}
        fill="none"
        stroke="var(--color-brand-500)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}

function HeroStat({ label, value, hint }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/40">{label}</p>
      <p className="mt-1 truncate text-[17px] font-semibold tracking-tight text-white">{value}</p>
      {hint && <p className="mt-0.5 truncate text-[11px] text-white/45">{hint}</p>}
    </div>
  )
}

function HeroBand({ month, trend, showProfit, monthLabel }) {
  const lastSeven = sumRevenue(trend?.slice(-7))
  const priorSeven = sumRevenue(trend?.slice(0, 7))
  const change = changeBetween(lastSeven, priorSeven)

  const orders = Number(month?.orders ?? 0)
  const average = orders ? Number(month?.revenue ?? 0) / orders : 0

  return (
    <section className="relative overflow-hidden rounded-2xl bg-navy-950 shadow-raised">
      {/* A single warm bloom behind the figure -- the brand used as light. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-24 -top-32 h-72 w-72 rounded-full bg-brand-600/25 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent"
      />

      <div className="relative grid gap-6 p-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:p-6">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/45">
            Delivered revenue · {monthLabel}
          </p>

          <p className="mt-2 text-[44px] font-semibold leading-none tracking-tight text-white">
            {round(month?.revenue)}
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1">
            <Delta change={change} since="previous 7 days" onDark />
            <span className="text-[11px] text-white/45">
              {round(lastSeven)} in the last 7 days
            </span>
          </div>

          <div className="mt-4 max-w-sm">
            <Sparkline series={trend} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-5 self-center border-white/10 sm:grid-cols-3 lg:border-l lg:pl-6">
          <HeroStat
            label="Orders"
            value={orders.toLocaleString('en-IN')}
            hint="delivered this month"
          />

          <HeroStat
            label="Average order"
            value={orders ? round(average) : '—'}
            hint={orders ? 'per delivered order' : 'nothing delivered yet'}
          />

          {showProfit ? (
            <HeroStat
              label="Gross profit"
              value={round(month?.gross_profit)}
              hint="after cost of goods"
            />
          ) : (
            <HeroStat
              label="Delivery income"
              value={round(month?.delivery_income)}
              hint="shipping charged"
            />
          )}
        </div>
      </div>
    </section>
  )
}


/* -------------------------------------------------------
   KPI tile
------------------------------------------------------- */

const TILE_TONES = {
  neutral: 'bg-ink-100 text-ink-600',
  brand: 'bg-brand-50 text-brand-700',
  accent: 'bg-accent-50 text-accent-700',
  warning: 'bg-warning-50 text-warning-700',
  danger: 'bg-danger-50 text-danger-700',
}

function Tile({ label, value, hint, icon: Icon, tone = 'neutral', href, change, since }) {
  const body = (
    <div
      className={cx(
        'group h-full rounded-2xl border border-ink-200 bg-white p-4 shadow-card',
        'transition duration-200',
        href && 'hover:-translate-y-0.5 hover:border-ink-300 hover:shadow-raised',
      )}
    >
      <div className="flex items-center gap-2.5">
        <span
          className={cx('grid h-8 w-8 shrink-0 place-items-center rounded-xl', TILE_TONES[tone])}
        >
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>

        <p className="min-w-0 flex-1 truncate text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-500">
          {label}
        </p>

        {href && (
          <ArrowRight
            className="h-3.5 w-3.5 shrink-0 text-ink-300 transition group-hover:translate-x-0.5 group-hover:text-brand-600"
            aria-hidden="true"
          />
        )}
      </div>

      <p className="mt-3 text-[26px] font-semibold leading-none tracking-tight text-ink-900">
        {value}
      </p>

      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
        {change !== undefined && <Delta change={change} since={since} />}
        {hint && <p className="text-[11px] text-ink-500">{hint}</p>}
      </div>
    </div>
  )

  return href ? (
    <Link to={href} className="block h-full">
      {body}
    </Link>
  ) : (
    body
  )
}


/* -------------------------------------------------------
   Site overview
------------------------------------------------------- */

function bytes(value) {
  const n = Number(value) || 0

  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`

  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`
}

/*
 * The standing state of the shop, one card per area.
 *
 * `value` is what that area's screen opens on and `hint` is the part worth
 * doing something about -- so a card can be clicked without the number
 * changing underneath you. Anything that counts as work waiting turns amber
 * only while there is some.
 *
 * Order is deliberate: catalogue first, then the people, then the things
 * that go stale if nobody looks at them.
 */
const SITE_CARDS = [
  {
    key: 'products',
    label: 'Products',
    icon: Package,
    href: '/admin/products',
    hint: (d) => `${d.live} live on the storefront`,
  },
  {
    key: 'categories',
    label: 'Categories',
    icon: FolderTree,
    href: '/admin/categories',
    hint: (d) => `${d.live} active`,
  },
  {
    key: 'brands',
    label: 'Brands',
    icon: Tag,
    href: '/admin/brands',
    hint: (d) => `${d.live} active`,
  },
  {
    key: 'media',
    label: 'Media',
    icon: Images,
    href: '/admin/media',
    hint: (d) => `${bytes(d.live)} stored`,
  },
  {
    key: 'customers',
    label: 'Customers',
    icon: Users,
    // No link: the admin has no customer screen yet, and a card that opens
    // nothing is better than one that opens the wrong list.
    hint: (d) => `${d.live} joined this month`,
  },
  {
    key: 'staff',
    label: 'Logins',
    icon: ShieldCheck,
    href: '/admin/users',
    hint: (d) => `${d.live} with a staff role`,
  },
  {
    key: 'rewards',
    label: 'Points held',
    icon: Gift,
    href: '/admin/rewards',
    hint: (d) => `by ${d.live} customer${d.live === 1 ? '' : 's'}`,
  },
  {
    key: 'reviews',
    label: 'Reviews',
    icon: Star,
    href: '/admin/reviews',
    hint: (d) => (d.live ? `${d.live} awaiting moderation` : 'nothing waiting'),
    busy: (d) => d.live > 0,
  },
  {
    key: 'messages',
    label: 'Messages',
    icon: MessageSquare,
    href: '/admin/contact-messages',
    hint: (d) => (d.live ? `${d.live} unread` : 'all read'),
    busy: (d) => d.live > 0,
  },
  {
    key: 'coupons',
    label: 'Coupons',
    icon: Ticket,
    href: '/admin/coupons',
    hint: (d) => `${d.live} running now`,
  },
  {
    key: 'banners',
    label: 'Banners',
    icon: GalleryHorizontal,
    href: '/admin/banners',
    hint: (d) => `${d.live} active`,
  },
  {
    key: 'faqs',
    label: 'FAQ',
    icon: HelpCircle,
    href: '/admin/faqs',
    hint: (d) => `${d.live} shown on the site`,
  },
]

function SiteCard({ card, data }) {
  const Icon = card.icon
  const busy = card.busy?.(data) ?? false

  const body = (
    <div
      className={cx(
        'group relative h-full overflow-hidden rounded-2xl border bg-white p-3 shadow-card',
        'transition duration-200',
        busy ? 'border-warning-500/40' : 'border-ink-200',
        card.href && 'hover:-translate-y-0.5 hover:border-ink-300 hover:shadow-raised',
      )}
    >
      {/* A wash that only shows on hover -- the "premium" is the restraint. */}
      <div
        aria-hidden="true"
        className={cx(
          'pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-200',
          'bg-gradient-to-br from-brand-50/80 to-transparent',
          card.href && 'group-hover:opacity-100',
        )}
      />

      <div className="relative flex items-center gap-2">
        <span
          className={cx(
            'grid h-7 w-7 shrink-0 place-items-center rounded-lg',
            busy ? 'bg-warning-50 text-warning-700' : 'bg-ink-100 text-ink-600',
            card.href && 'transition-colors group-hover:bg-brand-600 group-hover:text-white',
          )}
        >
          <Icon className="h-3.5 w-3.5" aria-hidden="true" />
        </span>

        <p className="min-w-0 flex-1 truncate text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-500">
          {card.label}
        </p>

        {card.href && (
          <ArrowRight
            className="h-3 w-3 shrink-0 text-ink-300 transition group-hover:translate-x-0.5 group-hover:text-brand-600"
            aria-hidden="true"
          />
        )}
      </div>

      <p className="relative mt-2 text-[20px] font-semibold leading-none tracking-tight text-ink-900">
        {compact(data.total)}
      </p>

      <p
        className={cx(
          'relative mt-1.5 truncate text-[11px]',
          busy ? 'font-medium text-warning-700' : 'text-ink-500',
        )}
      >
        {card.hint(data)}
      </p>
    </div>
  )

  return card.href ? (
    <Link to={card.href} className="block h-full">
      {body}
    </Link>
  ) : (
    body
  )
}

function SiteOverview({ site }) {
  // Every area the viewer cannot see arrives as null, so this is also the
  // permission filter -- there is nothing to hide that was ever sent.
  const cards = SITE_CARDS.filter((card) => site?.[card.key])

  if (cards.length === 0) return null

  return (
    <section>
      <div className="mb-2.5 flex items-center gap-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-500">
          Across the site
        </h2>
        <span className="h-px flex-1 bg-ink-200" />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        {cards.map((card) => (
          <SiteCard key={card.key} card={card} data={site[card.key]} />
        ))}
      </div>
    </section>
  )
}


/* -------------------------------------------------------
   Pipeline
------------------------------------------------------- */

const STAGE_ICONS = {
  pending: Clock3,
  on_hold: PauseCircle,
  confirmed: CheckCircle2,
  processing: Cog,
  packed: PackageCheck,
  ready_to_ship: Boxes,
  shipped: Truck,
  out_for_delivery: Navigation,
}

/**
 * Orders still in flight, weighted by what they are worth.
 *
 * The bar is share of the money sitting in the pipeline, not share of the
 * count: six small orders to confirm and six large ones look identical on a
 * count, and they are not the same day's work.
 */
function Pipeline({ pipeline }) {
  const stages = pipeline?.stages ?? []
  const totalValue = Number(pipeline?.value ?? 0)
  const totalOrders = Number(pipeline?.orders ?? 0)

  return (
    <section className="flex flex-col rounded-2xl border border-ink-200 bg-white shadow-card">
      <header className="flex items-start justify-between gap-3 px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold text-ink-900">In flight</h2>
          <p className="mt-0.5 text-xs text-ink-500">
            {totalOrders} order{totalOrders === 1 ? '' : 's'} · {round(totalValue)} outstanding
          </p>
        </div>

        <Link
          to="/admin/orders"
          className="shrink-0 text-xs font-semibold text-brand-700 transition hover:text-brand-800"
        >
          All orders
        </Link>
      </header>

      <div className="flex-1 divide-y divide-ink-100 border-t border-ink-100">
        {stages.map((stage) => {
          const Icon = STAGE_ICONS[stage.status] ?? PackageCheck
          const value = Number(stage.value ?? 0)
          const share = totalValue > 0 ? (value / totalValue) * 100 : 0
          const urgent =
            (stage.status === 'pending' || stage.status === 'on_hold') && stage.orders > 0

          return (
            <Link
              key={stage.status}
              to={`/admin/orders?status=${stage.status}`}
              className="group block px-5 py-3 transition-colors hover:bg-ink-50"
            >
              <div className="flex items-center gap-3">
                <span
                  className={cx(
                    'grid h-8 w-8 shrink-0 place-items-center rounded-xl',
                    urgent ? 'bg-warning-50 text-warning-700' : 'bg-ink-100 text-ink-500',
                  )}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </span>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-ink-800">{stage.label}</p>
                  <p className="mt-0.5 text-[11px] text-ink-500 tabular">{round(value)}</p>
                </div>

                <p className="text-base font-semibold text-ink-900 tabular">{stage.orders}</p>
              </div>

              <div className="mt-2 h-1 overflow-hidden rounded-full bg-ink-100">
                <div
                  className="h-full rounded-full bg-brand-500 transition-all"
                  style={{ width: `${share}%` }}
                />
              </div>
            </Link>
          )
        })}

        {!stages.length && (
          <p className="px-5 py-8 text-center text-sm text-ink-400">Nothing in flight.</p>
        )}
      </div>
    </section>
  )
}


/* -------------------------------------------------------
   Latest orders
------------------------------------------------------- */

function LatestOrders({ orders }) {
  return (
    <section className="rounded-2xl border border-ink-200 bg-white shadow-card">
      <header className="flex items-start justify-between gap-3 px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold text-ink-900">Latest orders</h2>
          <p className="mt-0.5 text-xs text-ink-500">The six most recent, whatever their state</p>
        </div>

        <Link
          to="/admin/orders"
          className="shrink-0 text-xs font-semibold text-brand-700 transition hover:text-brand-800"
        >
          All orders
        </Link>
      </header>

      {orders?.length ? (
        <div className="scroll-x border-t border-ink-100">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="bg-ink-50/70">
                <th
                  scope="col"
                  className="px-5 py-2.5 text-left text-[10px] font-bold uppercase tracking-[0.1em] text-ink-500"
                >
                  Customer
                </th>
                <th
                  scope="col"
                  className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-[0.1em] text-ink-500"
                >
                  Placed
                </th>
                <th
                  scope="col"
                  className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-[0.1em] text-ink-500"
                >
                  Delivering to
                </th>
                <th
                  scope="col"
                  className="px-3 py-2.5 text-right text-[10px] font-bold uppercase tracking-[0.1em] text-ink-500"
                >
                  Total
                </th>
                <th
                  scope="col"
                  className="px-5 py-2.5 text-right text-[10px] font-bold uppercase tracking-[0.1em] text-ink-500"
                >
                  Status
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-ink-100">
              {orders.map((order) => (
                <tr key={order.id} className="group transition-colors hover:bg-ink-50">
                  <td className="px-5 py-3">
                    <Link
                      to={`/admin/orders/${order.id}`}
                      className="block text-[13px] font-semibold text-ink-900 transition group-hover:text-brand-700"
                    >
                      {order.customer}
                    </Link>
                    <span className="text-[11px] text-ink-400 tabular">{order.number}</span>
                  </td>

                  <td className="px-3 py-3 text-[11px] text-ink-500">
                    {relativeTime(order.placed_at)}
                  </td>

                  <td className="px-3 py-3 text-[12px] text-ink-600">{order.district || '—'}</td>

                  <td className="px-3 py-3 text-right text-[13px] font-semibold text-ink-900 tabular">
                    {round(order.total)}
                  </td>

                  <td className="px-5 py-3 text-right">
                    <Badge tone={statusTone(order.status)}>{order.status_label}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="border-t border-ink-100 px-5 py-10 text-center text-sm text-ink-400">
          No orders yet.
        </p>
      )}
    </section>
  )
}


/* -------------------------------------------------------
   Skeleton
------------------------------------------------------- */

function Skeleton() {
  return (
    <div className="space-y-4">
      <div className="h-9 w-56 animate-pulse rounded-lg bg-ink-200" />
      <div className="h-48 animate-pulse rounded-2xl bg-ink-200" />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="h-32 animate-pulse rounded-2xl bg-ink-200" />
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="h-80 animate-pulse rounded-2xl bg-ink-200" />
        <div className="h-80 animate-pulse rounded-2xl bg-ink-200" />
      </div>
    </div>
  )
}


/* -------------------------------------------------------
   Page
------------------------------------------------------- */

function greeting() {
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: TZ,
      hour: '2-digit',
      hourCycle: 'h23',
    }).format(new Date()),
  )

  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'

  return 'Good evening'
}

export default function DashboardPage() {
  const can = useAuthStore((state) => state.can)
  const user = useAuthStore((state) => state.user)

  const query = useQuery({
    queryKey: ['admin', 'dashboard'],
    queryFn: () => get('/admin/dashboard'),
    select: (response) => response.data,
    placeholderData: (previous) => previous,
  })

  if (query.isLoading) return <Skeleton />

  if (query.isError) return <ErrorState error={query.error} onRetry={query.refetch} />

  const { today, month, pipeline, stock, trend, recent } = query.data

  const firstName = user?.name?.split(' ')[0] ?? 'there'
  const seesMoney = can('accounting.view')

  const now = new Date()
  const monthLabel = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, month: 'long' }).format(now)
  const fullDate = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(now)

  const stageOf = (status) => pipeline?.stages?.find((stage) => stage.status === status)

  /*
   * One stage per tile, not a group.
   *
   * A tile counts exactly what its link opens. Summing "pending plus on
   * hold" reads well until someone clicks a tile showing seven and lands on
   * a list of five, because the orders list filters by a single status --
   * and then they stop trusting the number. The stages these leave out are
   * not hidden: every one of them has its own row, with its own count and
   * its own link, in the pipeline card below.
   */
  const pendingStage = stageOf('pending')
  const shippedStage = stageOf('shipped')

  /*
   * Today against yesterday, read off the same 14-day series the chart
   * draws, so the tile and the plot can never tell two different stories.
   */
  const todayChange = changeBetween(trend?.at(-1)?.revenue, trend?.at(-2)?.revenue)

  const stockAlerts = Number(stock?.out_of_stock ?? 0) + Number(stock?.low_stock ?? 0)

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight text-ink-900">
            {greeting()}, {firstName}
          </h1>
          <p className="mt-0.5 text-xs text-ink-500">{fullDate}</p>
        </div>

        <button
          type="button"
          onClick={() => query.refetch()}
          disabled={query.isFetching}
          className={cx(
            'inline-flex h-9 items-center gap-2 rounded-lg border border-ink-200 bg-white px-3',
            'text-xs font-semibold text-ink-600 shadow-card transition',
            'hover:border-ink-300 hover:text-ink-900 disabled:opacity-60',
          )}
        >
          <RefreshCw
            className={cx('h-3.5 w-3.5', query.isFetching && 'animate-spin')}
            aria-hidden="true"
          />
          {query.isFetching ? 'Refreshing' : 'Refresh'}
        </button>
      </div>

      <HeroBand month={month} trend={trend} monthLabel={monthLabel} showProfit={seesMoney} />

      {/* Tiles */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Tile
          label="Today"
          value={round(today.revenue)}
          hint={`${today.orders} delivered`}
          icon={Wallet}
          tone="accent"
          change={todayChange}
          since="yesterday"
        />

        <Tile
          label="To confirm"
          value={pendingStage?.orders ?? 0}
          hint={`${round(pendingStage?.value)} waiting`}
          icon={Clock3}
          tone={pendingStage?.orders > 0 ? 'warning' : 'neutral'}
          href="/admin/orders?status=pending"
        />

        <Tile
          label="On the way"
          value={shippedStage?.orders ?? 0}
          hint={`${round(shippedStage?.value)} with the courier`}
          icon={Truck}
          tone="brand"
          href="/admin/orders?status=shipped"
        />

        {stock ? (
          <Tile
            label="Stock alerts"
            value={stockAlerts}
            hint={
              stockAlerts
                ? `${stock.out_of_stock} out · ${stock.low_stock} running low`
                : `${stock.tracked} items healthy`
            }
            icon={stockAlerts ? AlertTriangle : Boxes}
            tone={stockAlerts ? 'danger' : 'accent'}
            href={stock.out_of_stock > 0 ? '/admin/products?stock=out' : '/admin/products?stock=low'}
          />
        ) : (
          <Tile
            label="Delivery income"
            value={round(month.delivery_income)}
            hint="shipping charged this month"
            icon={ShoppingBag}
            tone="neutral"
          />
        )}
      </div>

      {/*
         Without the accounting permission there is no revenue trend to
         draw, so the orders table takes the wide column rather than leaving
         a hole where the chart would have been.
      */}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        {seesMoney ? <RevenueChart series={trend} /> : <LatestOrders orders={recent} />}
        <Pipeline pipeline={pipeline} />
      </div>

      {seesMoney && <LatestOrders orders={recent} />}

      <SiteOverview site={query.data.site} />
    </div>
  )
}
