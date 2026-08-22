import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ImageOff, PackageOpen } from 'lucide-react'

import { cx, date, money, quantity } from '../../../lib/format'
import { Spinner, useToast } from '../../../components/ui'
import { useCancelOrder, useMyOrders } from '../../checkout/useCheckout'
import { AccountButton, Panel, fieldClass } from './shell'

/*
 * "Sort by" in the design is really a filter, and these are the three
 * answers anyone wants: what is still coming, what arrived, and what did
 * not happen. Filtering the fetched page client-side rather than refetching
 * -- the list is one page of the customer's own orders, not a catalogue.
 */
const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'open', label: 'In progress' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'closed', label: 'Cancelled & returned' },
]

const CLOSED = new Set(['cancelled', 'returned'])

function matchesFilter(order, filter) {
  if (filter === 'all') return true
  if (filter === 'delivered') return order.status === 'delivered'
  if (filter === 'closed') return CLOSED.has(order.status)

  return order.status !== 'delivered' && !CLOSED.has(order.status)
}

/** The sentence under the items, in the customer's terms rather than ours. */
const STATUS_SENTENCE = {
  pending: 'Your order has been placed and is waiting to be confirmed',
  on_hold: 'Your order is on hold — we will call you about it',
  confirmed: 'Your order has been confirmed',
  processing: 'Your order is being prepared',
  packed: 'Your order has been packed',
  ready_to_ship: 'Your order is ready and waiting for the courier',
  shipped: 'Your order is on its way',
  out_for_delivery: 'Your order is out for delivery today',
  delivered: 'Your order has been delivered',
  cancelled: 'Your order was cancelled',
  returned: 'Your order came back to us',
}

const STATUS_PILL = {
  pending: 'border-warning-500 text-warning-700',
  on_hold: 'border-warning-500 text-warning-700',
  confirmed: 'border-brand-500 text-brand-700',
  processing: 'border-brand-500 text-brand-700',
  packed: 'border-brand-500 text-brand-700',
  ready_to_ship: 'border-brand-500 text-brand-700',
  shipped: 'border-brand-500 text-brand-700',
  out_for_delivery: 'border-brand-500 text-brand-700',
  delivered: 'border-success-500 text-success-700',
  cancelled: 'border-ink-300 text-ink-500',
  returned: 'border-danger-500 text-danger-700',
}

function HeaderFact({ label, value }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-medium text-navy-900/70">{label}</p>
      <p className="mt-0.5 truncate text-sm font-bold text-navy-900">{value}</p>
    </div>
  )
}

function OrderCard({ order }) {
  const cancel = useCancelOrder()
  const toast = useToast()

  const delivered = order.status === 'delivered'

  const onCancel = () => {
    if (!window.confirm(`Cancel order ${order.number}? This cannot be undone.`)) return

    cancel.mutate(
      { number: order.number, reason: 'Cancelled from my account' },
      {
        onSuccess: () => toast.success('Order cancelled.'),
        onError: (error) => toast.error(error?.message ?? 'Could not cancel this order.'),
      },
    )
  }

  return (
    <article className="overflow-hidden rounded-2xl border border-ink-200">
      {/* The header strip carries the four facts the design leads with. */}
      <header className="grid grid-cols-2 gap-4 bg-brand-400 px-5 py-4 sm:grid-cols-4">
        <HeaderFact label="Order ID" value={order.number} />
        <HeaderFact label="Total Payment" value={money(order.total)} />
        <HeaderFact label="Payment Method" value={order.payment_method?.name ?? '—'} />
        <HeaderFact
          label={delivered ? 'Delivered Date' : 'Placed'}
          value={date(delivered ? order.delivered_at : order.placed_at)}
        />
      </header>

      <div className="divide-y divide-ink-100">
        {(order.items ?? []).map((item) => (
          <div key={item.id} className="flex items-center gap-4 px-5 py-3.5">
            <span className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-xl bg-ink-50">
              {item.image ? (
                <img src={item.image} alt="" className="h-full w-full object-cover" />
              ) : (
                <ImageOff className="h-5 w-5 text-ink-300" aria-hidden="true" />
              )}
            </span>

            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-ink-900">{item.product_name}</p>
              <p className="mt-0.5 truncate text-xs text-ink-500">
                {item.variation_name ? `${item.variation_name} | ` : ''}
                {quantity(item.quantity)} Qty.
              </p>
            </div>

            <span className="shrink-0 text-sm font-semibold tabular text-ink-900">
              {money(item.line_total)}
            </span>
          </div>
        ))}
      </div>

      <footer className="border-t border-ink-100 px-5 py-4">
        <div className="flex flex-wrap items-center gap-3">
          <span
            className={cx(
              'inline-flex shrink-0 items-center rounded-full border px-3 py-0.5 text-xs font-semibold',
              STATUS_PILL[order.status] ?? 'border-ink-300 text-ink-600',
            )}
          >
            {order.status_label}
          </span>

          <p className="text-sm text-ink-600">
            {STATUS_SENTENCE[order.status] ?? order.status_label}
          </p>
        </div>

        {Number(order.due_total) > 0 && (
          <p className="mt-2 text-xs font-medium text-warning-700">
            {money(order.due_total)} due{order.payment_method?.is_cod ? ' on delivery' : ''}
          </p>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Link
            to={`/orders/${order.number}`}
            className="inline-flex h-11 items-center rounded-full bg-navy-900 px-6 text-sm font-semibold text-white transition hover:bg-navy-800"
          >
            Track Order
          </Link>

          {order.can_cancel && (
            <AccountButton
              type="button"
              variant="danger"
              onClick={onCancel}
              disabled={cancel.isPending}
              className="ml-auto h-11 px-4"
            >
              {cancel.isPending ? 'Cancelling…' : 'Cancel Order'}
            </AccountButton>
          )}
        </div>
      </footer>
    </article>
  )
}

export function MyOrders() {
  const orders = useMyOrders()
  const [filter, setFilter] = useState('all')

  const rows = useMemo(
    () => (orders.data?.data ?? []).filter((order) => matchesFilter(order, filter)),
    [orders.data, filter],
  )

  if (orders.isLoading) {
    return (
      <Panel>
        <div className="grid place-items-center py-16">
          <Spinner />
        </div>
      </Panel>
    )
  }

  /*
   * A staff account has no customer record and so no order history. That is
   * correct, not a fault, and it should not read as one.
   */
  if (orders.error?.status === 403) {
    return (
      <Panel title="This account does not place orders">
        <p className="text-sm text-ink-600">
          Order history belongs to customer accounts. You can still look up any order by its
          number on the{' '}
          <Link to="/track" className="font-semibold text-brand-800 hover:underline">
            tracking page
          </Link>
          .
        </p>
      </Panel>
    )
  }

  if (orders.isError) {
    return (
      <Panel title="Could not load your orders">
        <p className="text-sm text-danger-700">{orders.error?.message}</p>
        <AccountButton type="button" onClick={orders.refetch} className="mt-4">
          Try again
        </AccountButton>
      </Panel>
    )
  }

  const total = orders.data?.data?.length ?? 0

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold text-ink-900">Orders ({total})</h2>

        <label className="flex items-center gap-2 text-sm text-ink-600">
          Sort by :
          <select
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            className={cx(fieldClass, 'h-11 w-48')}
            aria-label="Filter orders"
          >
            {FILTERS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {rows.length === 0 ? (
        <Panel>
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <PackageOpen className="h-8 w-8 text-ink-300" aria-hidden="true" />
            <p className="font-semibold text-ink-800">
              {total === 0 ? 'No orders yet' : 'Nothing matches that filter'}
            </p>
            {total === 0 && (
              <Link
                to="/products"
                className="mt-1 inline-flex h-11 items-center rounded-full bg-navy-900 px-6 text-sm font-semibold text-white hover:bg-navy-800"
              >
                Start shopping
              </Link>
            )}
          </div>
        </Panel>
      ) : (
        rows.map((order) => <OrderCard key={order.number} order={order} />)
      )}
    </div>
  )
}
