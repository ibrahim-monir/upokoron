import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowUpRight,
  Boxes,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Cog,
  Edit3,
  Eye,
  Filter,
  Navigation,
  PackageCheck,
  PauseCircle,
  ReceiptText,
  RotateCcw,
  Search,
  Trash2,
  Truck,
  Undo2,
} from 'lucide-react'
import { del, get, post, put } from '../../lib/api'
import { useAuthStore } from '../../stores/authStore'
import { cx, dateTime, listDate, money } from '../../lib/format'
import { OrderQuickView, OrderStatusControl } from './OrderQuickView'
import {
  EmptyState,
  ErrorState,
  Input,
  Pagination,
  Select,
  Spinner,
  TableWrap,
  Td,
  Th,
  useToast,
} from '../../components/ui'

const STATUSES = [
  { value: '', label: 'All statuses' },
  { value: 'pending', label: 'Pending' },
  { value: 'on_hold', label: 'On hold' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'processing', label: 'Processing' },
  { value: 'packed', label: 'Packed' },
  { value: 'ready_to_ship', label: 'Ready to ship' },
  { value: 'shipped', label: 'Shipped' },
  { value: 'out_for_delivery', label: 'Out for delivery' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'returned', label: 'Returned (RTO)' },
]

/*
 * The board across the top, in lifecycle order.
 *
 * Only the statuses an order can still move out of appear here: these tiles
 * are a worklist, and a tile for "delivered" would be a number nobody can
 * act on sitting where the day's work should be. Finished orders are still
 * reachable through the filter beneath.
 */
const STATUS_META = {
  pending: { icon: Clock3, label: 'Pending', iconShell: 'bg-amber-400/15 text-amber-300', value: 'text-amber-200' },
  on_hold: { icon: PauseCircle, label: 'On hold', iconShell: 'bg-rose-400/15 text-rose-300', value: 'text-rose-200' },
  confirmed: { icon: CheckCircle2, label: 'Confirmed', iconShell: 'bg-sky-400/15 text-sky-300', value: 'text-sky-200' },
  processing: { icon: Cog, label: 'Processing', iconShell: 'bg-indigo-400/15 text-indigo-300', value: 'text-indigo-200' },
  packed: { icon: PackageCheck, label: 'Packed', iconShell: 'bg-violet-400/15 text-violet-300', value: 'text-violet-200' },
  ready_to_ship: { icon: Boxes, label: 'Ready to ship', iconShell: 'bg-teal-400/15 text-teal-300', value: 'text-teal-200' },
  shipped: { icon: Truck, label: 'Shipped', iconShell: 'bg-cyan-400/15 text-cyan-300', value: 'text-cyan-200' },
  out_for_delivery: { icon: Navigation, label: 'Out for delivery', iconShell: 'bg-emerald-400/15 text-emerald-300', value: 'text-emerald-200' },
}

function StatusOverview({ summary, active, onPick }) {
  if (!summary) return null

  const tiles = Object.keys(STATUS_META).map((key) => ({
    key,
    ...(summary.by_status?.[key] ?? {
      orders: 0,
      value: 0,
      label: STATUS_META[key].label,
    }),
  }))

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 2xl:grid-cols-8">
      {tiles.map((tile) => {
        const meta = STATUS_META[tile.key]
        const Icon = meta.icon
        const selected = active === tile.key

        return (
          <button
            key={tile.key}
            type="button"
            onClick={() => onPick(selected ? '' : tile.key)}
            className={cx(
              'group relative min-w-0 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.06] p-3 text-left backdrop-blur transition duration-200',
              'hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/10',
              selected && 'border-white/40 bg-white/15 ring-1 ring-white/40',
            )}
          >
            <div className="relative flex items-start justify-between">
              <div className={cx('grid h-8 w-8 place-items-center rounded-lg', meta.iconShell)}>
                <Icon className="h-4 w-4" />
              </div>

              <ChevronRight
                className={cx(
                  'h-4 w-4 transition-transform',
                  selected ? 'rotate-90 text-white' : 'text-white/30 group-hover:translate-x-0.5',
                )}
              />
            </div>

            <div className="relative mt-3">
              <p className="text-[11px] font-semibold uppercase leading-tight tracking-wider text-white/60">
                {tile.label}
              </p>
              <p className={cx('mt-1 text-xl font-bold tabular', meta.value)}>
                {tile.orders ?? 0}
              </p>
              <p className="mt-0.5 truncate text-[11px] font-medium tabular text-white/45">
                {money(tile.value ?? 0)}
              </p>
            </div>
          </button>
        )
      })}
    </div>
  )
}

function PaymentBadge({ order }) {
  const due = Number(order.due_total) > 0

  return (
    <div className="space-y-1">
      <p className="font-medium text-ink-800">{order.payment_method || '—'}</p>

      {due ? (
        <span className="inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
          {money(order.due_total)} due
        </span>
      ) : (
        <span className="inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
          Paid
        </span>
      )}
    </div>
  )
}

/*
 * What a trashed order can do instead of moving along: come back, or go for
 * good. Restoring takes its stock back and is refused if that stock has sold
 * in the meantime; deleting permanently has no undo, so it asks first.
 */
function TrashActions({ order }) {
  const toast = useToast()
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: (action) =>
      action === 'restore'
        ? post(`/admin/orders/${order.id}/restore`)
        : del(`/admin/orders/${order.id}/force`),
    onSuccess: (response) => {
      toast.success(response?.message ?? 'Done.')
      queryClient.invalidateQueries({ queryKey: ['admin', 'orders'] })
    },
    onError: (error) => {
      toast.error(error?.response?.data?.message ?? error?.message ?? 'That did not work.')
    },
  })

  const forceDelete = () => {
    if (!window.confirm(`Delete order ${order.number} permanently? This cannot be undone.`)) {
      return
    }

    mutation.mutate('force')
  }

  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={() => mutation.mutate('restore')}
        disabled={mutation.isPending}
        className="inline-flex items-center gap-1.5 rounded-xl border border-ink-200 bg-white px-3 py-2 text-xs font-bold text-ink-700 shadow-sm transition hover:border-brand-300 hover:bg-brand-50 hover:text-brand-800 disabled:opacity-50"
      >
        <Undo2 className="h-3.5 w-3.5" />
        Restore
      </button>

      <button
        type="button"
        onClick={forceDelete}
        disabled={mutation.isPending}
        className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 bg-white px-3 py-2 text-xs font-bold text-red-700 shadow-sm transition hover:border-red-300 hover:bg-red-50 disabled:opacity-50"
      >
        <Trash2 className="h-3.5 w-3.5" />
        Delete permanently
      </button>
    </div>
  )
}

/*
 * The statuses a batch of orders can be pushed to. Each order still goes
 * through its own transition rules on the server, so a batch that mixes
 * orders at different stages simply reports the ones that could not move.
 */
const BULK_STATUSES = STATUSES.filter((option) => option.value && option.value !== 'pending')

const BULK_CONFIRM = {
  'status:delivered': (n) => `Mark ${n} order(s) delivered? This records the sale and its accounting entries.`,
  'status:cancelled': (n) => `Cancel ${n} order(s)? Their stock is released.`,
  trash: (n) => `Move ${n} order(s) to trash? Their stock is released. You can restore them from the trash.`,
  force: (n) => `Delete ${n} order(s) permanently? This cannot be undone.`,
}

function requestFor(action, id) {
  if (action.startsWith('status:')) {
    return put(`/admin/orders/${id}/status`, { status: action.slice('status:'.length) })
  }

  if (action === 'trash') return del(`/admin/orders/${id}`)
  if (action === 'restore') return post(`/admin/orders/${id}/restore`)

  return del(`/admin/orders/${id}/force`)
}

function BulkActions({ trashed, rows, selected, onDone }) {
  const toast = useToast()
  const queryClient = useQueryClient()
  const can = useAuthStore((state) => state.can)
  const [action, setAction] = useState('')
  const [running, setRunning] = useState(false)

  const options = trashed
    ? can('orders.delete')
      ? [
          { value: 'restore', label: 'Restore' },
          { value: 'force', label: 'Delete permanently' },
        ]
      : []
    : [
        ...(can('orders.status')
          ? BULK_STATUSES.map((option) => ({
              value: `status:${option.value}`,
              label: `Change status to ${option.label.toLowerCase()}`,
            }))
          : []),
        ...(can('orders.delete') ? [{ value: 'trash', label: 'Move to trash' }] : []),
      ]

  if (options.length === 0) return null

  const apply = async () => {
    const orders = rows.filter((order) => selected.has(order.id))

    if (!action || orders.length === 0 || running) return
    if (BULK_CONFIRM[action] && !window.confirm(BULK_CONFIRM[action](orders.length))) return

    setRunning(true)

    // One at a time: each order locks its own row and inventory on the
    // server, and a burst of parallel writes would only queue there anyway.
    const failures = []

    for (const order of orders) {
      try {
        await requestFor(action, order.id)
      } catch (error) {
        failures.push(`${order.number}: ${error?.response?.data?.message ?? error?.message ?? 'failed'}`)
      }
    }

    setRunning(false)
    setAction('')
    queryClient.invalidateQueries({ queryKey: ['admin', 'orders'] })
    onDone()

    const done = orders.length - failures.length

    if (done > 0) toast.success(`${done} order${done === 1 ? '' : 's'} updated.`)
    if (failures.length > 0) {
      toast.error(
        `${failures.length} order${failures.length === 1 ? '' : 's'} could not be changed. ${failures.slice(0, 3).join(' ')}`,
      )
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Select
        value={action}
        onChange={(event) => setAction(event.target.value)}
        aria-label="Bulk actions"
        className="h-9 w-56 rounded-xl text-sm"
        disabled={running}
      >
        <option value="">Bulk actions</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>

      <button
        type="button"
        onClick={apply}
        disabled={!action || selected.size === 0 || running}
        className="inline-flex h-9 items-center rounded-xl border border-brand-200 bg-brand-50 px-3.5 text-xs font-bold text-brand-800 transition hover:bg-brand-100 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {running ? 'Applying…' : 'Apply'}
      </button>

      {selected.size > 0 && (
        <span className="text-xs font-semibold text-ink-500">{selected.size} selected</span>
      )}
    </div>
  )
}

function OrderRow({ order, onQuickView, checked, onToggle }) {
  const trashed = Boolean(order.deleted_at)
  const profit = order.gross_profit === null ? null : Number(order.gross_profit)

  return (
    <tr className="group border-t border-ink-100 transition-colors hover:bg-brand-50/35">
      <Td className="py-4">
        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={checked}
            onChange={() => onToggle(order.id)}
            aria-label={`Select order ${order.number}`}
            className="h-4 w-4 cursor-pointer rounded border-ink-300 text-brand-600 focus:ring-brand-500"
          />

          <div className="min-w-0">
            {trashed ? (
              <span className="font-bold text-ink-700">{order.number}</span>
            ) : (
              <Link
                to={`/admin/orders/${order.id}`}
                className="inline-flex items-center gap-1 font-bold text-brand-800 hover:text-brand-800"
              >
                {order.number}
                <ArrowUpRight className="h-3.5 w-3.5 opacity-0 transition group-hover:opacity-100" />
              </Link>
            )}
            {trashed && (
              <p className="mt-0.5 text-xs text-ink-400">
                Trashed {listDate(order.deleted_at)}
              </p>
            )}
          </div>
        </div>
      </Td>

      <Td className="py-4">
        <time
          dateTime={order.placed_at ?? undefined}
          title={dateTime(order.placed_at)}
          className="whitespace-nowrap text-sm text-ink-600"
        >
          {listDate(order.placed_at)}
        </time>
      </Td>

      <Td className="py-4">
        <div className="min-w-[150px]">
          <p className="font-semibold text-ink-900">{order.customer || 'Customer'}</p>
          <p className="mt-0.5 tabular text-xs text-ink-500">{order.phone || '—'}</p>
        </div>
      </Td>

      <Td className="py-4">
        <span className="rounded-lg bg-ink-50 px-2.5 py-1 text-xs font-medium text-ink-600">
          {order.district || '—'}
        </span>
      </Td>

      <Td className="py-4">
        <PaymentBadge order={order} />
      </Td>

      <Td numeric className="py-4">
        <span className="text-sm font-bold tabular text-ink-900">
          {money(order.total)}
        </span>
      </Td>

      <Td numeric className="py-4">
        {profit === null ? (
          <span className="text-ink-300">—</span>
        ) : (
          <span
            className={cx(
              'inline-flex rounded-full px-2.5 py-1 text-xs font-bold tabular',
              profit < 0
                ? 'bg-rose-50 text-rose-700'
                : 'bg-emerald-50 text-emerald-700',
            )}
          >
            {money(profit)}
          </span>
        )}
      </Td>

      <Td className="py-4">
        {trashed ? (
          <span className="rounded-full bg-ink-100 px-2.5 py-1 text-xs font-semibold text-ink-600">
            {order.status_label}
          </span>
        ) : (
          <OrderStatusControl order={order} />
        )}
      </Td>

      <Td className="py-4">
        {trashed ? (
          <TrashActions order={order} />
        ) : (
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => onQuickView(order.id)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-ink-200 bg-white px-3 py-2 text-xs font-bold text-ink-700 shadow-sm transition hover:border-brand-300 hover:bg-brand-50 hover:text-brand-800"
          >
            <Eye className="h-3.5 w-3.5" />
            Quick view
          </button>

          <Link
            to={`/admin/orders/${order.id}`}
            title="Open the full order"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-xl border border-ink-200 bg-white text-ink-500 shadow-sm transition hover:border-brand-300 hover:bg-brand-50 hover:text-brand-800"
          >
            <Edit3 className="h-3.5 w-3.5" />
            <span className="sr-only">Manage {order.number}</span>
          </Link>
        </div>
        )}
      </Td>
    </tr>
  )
}

export default function AdminOrdersPage() {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const [quickViewId, setQuickViewId] = useState(null)
  const [trashed, setTrashed] = useState(false)
  const [selected, setSelected] = useState(() => new Set())
  const can = useAuthStore((state) => state.can)

  const query = useQuery({
    queryKey: ['admin', 'orders', { search, status, page, trashed }],
    queryFn: () =>
      get('/admin/orders', {
        params: {
          search: search || undefined,
          status: status || undefined,
          trashed: trashed ? 1 : undefined,
          page,
        },
      }),
    placeholderData: (previous) => previous,
  })

  const rows = query.data?.data ?? []

  // A selection belongs to the rows on screen; a new page, filter or view
  // starts empty rather than acting on orders nobody can see.
  const viewKey = JSON.stringify({ search, status, page, trashed })
  const [selectionView, setSelectionView] = useState(viewKey)

  if (selectionView !== viewKey) {
    setSelectionView(viewKey)
    setSelected(new Set())
  }

  const allSelected = rows.length > 0 && rows.every((order) => selected.has(order.id))

  const toggle = (id) =>
    setSelected((current) => {
      const next = new Set(current)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(rows.map((order) => order.id)))
  const trashedCount = query.data?.trashed_count ?? 0

  const clearFilters = () => {
    setSearch('')
    setStatus('')
    setPage(1)
  }

  return (
    <div className="min-h-full bg-ink-50/40 pb-8">
      <div className="space-y-5">

        {/* Status board */}
        <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-950 via-slate-900 to-brand-950 p-4 text-white shadow-xl sm:p-5">
          <div className="absolute -right-20 -top-28 h-64 w-64 rounded-full bg-brand-500/25 blur-3xl" />
          <div className="absolute -bottom-28 left-1/3 h-56 w-56 rounded-full bg-cyan-400/15 blur-3xl" />

          <div className="relative">
            {trashed ? (
              <div>
                <h1 className="text-2xl font-bold tracking-tight">Trash</h1>
                <p className="mt-1 text-sm text-white/60">
                  Orders moved to trash. Restore one to bring it back, or delete it permanently.
                </p>
              </div>
            ) : (
              <>
              <h1 className="sr-only">Orders</h1>
              <StatusOverview
                summary={query.data?.summary}
                active={status}
                onPick={(next) => {
                  setStatus(next)
                  setPage(1)
                }}
              />
              </>
            )}
          </div>
        </section>

        {/* Search/filter toolbar */}
        <section className="rounded-2xl border border-ink-200 bg-white p-3 shadow-sm sm:p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="relative min-w-0 flex-1">
              <Search
                className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400"
                aria-hidden="true"
              />
              <Input
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value)
                  setPage(1)
                }}
                placeholder="Search order number, customer name or phone..."
                aria-label="Search orders"
                className="h-11 rounded-xl border-ink-200 bg-ink-50/50 pl-10"
              />
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative">
                <Filter className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-ink-400" />
                <Select
                  value={status}
                  onChange={(event) => {
                    setStatus(event.target.value)
                    setPage(1)
                  }}
                  aria-label="Filter by status"
                  className="h-11 w-full rounded-xl pl-9 sm:w-52"
                >
                  {STATUSES.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </div>

              {can('orders.delete') && (trashed || trashedCount > 0) && (
                <button
                  type="button"
                  onClick={() => {
                    setTrashed((value) => !value)
                    setPage(1)
                  }}
                  aria-pressed={trashed}
                  className={cx(
                    'inline-flex h-11 items-center justify-center gap-2 rounded-xl border px-4 text-xs font-bold',
                    trashed
                      ? 'border-red-300 bg-red-50 text-red-700'
                      : 'border-ink-200 bg-white text-ink-600 hover:bg-ink-50',
                  )}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {trashed ? 'Back to orders' : `Trash (${trashedCount})`}
                </button>
              )}

              {(search || status) && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-ink-200 bg-white px-4 text-xs font-bold text-ink-600 hover:bg-ink-50"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Clear
                </button>
              )}
            </div>
          </div>

          {(search || status) && (
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-ink-100 pt-3">
              <span className="text-xs font-semibold text-ink-400">Active filters:</span>

              {search && (
                <span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-800">
                  Search: {search}
                </span>
              )}

              {status && (
                <span className="rounded-full bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-700">
                  Status: {STATUSES.find((item) => item.value === status)?.label}
                </span>
              )}
            </div>
          )}
        </section>

        {/* Table */}
        {query.isError ? (
          <ErrorState error={query.error} onRetry={query.refetch} />
        ) : query.isLoading ? (
          <div className="grid place-items-center rounded-2xl border border-ink-200 bg-white py-20 shadow-sm">
            <Spinner />
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-2xl border border-ink-200 bg-white shadow-sm">
            <EmptyState
              icon={search || status ? Search : trashed ? Trash2 : ReceiptText}
              title={
                search || status
                  ? 'No orders match your filters'
                  : trashed
                    ? 'Trash is empty'
                    : 'No orders yet'
              }
              description={
                search || status
                  ? 'Try a different search or clear the active filters.'
                  : trashed
                    ? 'Orders you move to trash appear here until you restore or delete them.'
                    : 'Orders placed on the shop will appear here.'
              }
            />
          </div>
        ) : (
          <section className="overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-sm">
            <div className="flex flex-col gap-2 border-b border-ink-100 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <div>
                <h2 className="text-sm font-bold text-ink-900">
                  {trashed ? 'Trash' : 'Recent orders'}
                </h2>
                <p className="mt-0.5 text-xs text-ink-400">
                  {trashed
                    ? 'Restore an order to bring it back, or delete it permanently.'
                    : 'Click an order to view details and update its workflow.'}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <BulkActions
                  trashed={trashed}
                  rows={rows}
                  selected={selected}
                  onDone={() => setSelected(new Set())}
                />
                <span className="rounded-full bg-ink-50 px-3 py-1.5 text-xs font-semibold text-ink-500">
                  {rows.length} results
                </span>
              </div>
            </div>

            <div className="overflow-x-auto">
              <TableWrap>
                <table className="w-full min-w-[1150px] text-sm">
                  <thead className="bg-ink-50/70">
                    <tr>
                      <Th>
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            checked={allSelected}
                            ref={(element) => {
                              if (element) element.indeterminate = selected.size > 0 && !allSelected
                            }}
                            onChange={toggleAll}
                            aria-label="Select all orders on this page"
                            className="h-4 w-4 cursor-pointer rounded border-ink-300 text-brand-600 focus:ring-brand-500"
                          />
                          Order
                        </div>
                      </Th>
                      <Th>Date</Th>
                      <Th>Customer</Th>
                      <Th>Destination</Th>
                      <Th>Payment</Th>
                      <Th numeric>Total</Th>
                      <Th numeric>Profit</Th>
                      <Th>Status</Th>
                      <Th>Action</Th>
                    </tr>
                  </thead>

                  <tbody>
                    {rows.map((order) => (
                      <OrderRow
                        key={order.id}
                        order={order}
                        onQuickView={setQuickViewId}
                        checked={selected.has(order.id)}
                        onToggle={toggle}
                      />
                    ))}
                  </tbody>
                </table>
              </TableWrap>
            </div>
          </section>
        )}

        <div className="rounded-2xl border border-ink-200 bg-white px-4 py-3 shadow-sm">
          <Pagination meta={query.data?.meta} onPage={setPage} />
        </div>
      </div>

      {quickViewId && (
        <OrderQuickView orderId={quickViewId} onClose={() => setQuickViewId(null)} />
      )}
    </div>
  )
}