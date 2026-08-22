import { Link } from 'react-router-dom'
import { PackageOpen, PackageSearch } from 'lucide-react'
import { date, money } from '../../lib/format'
import { Badge, EmptyState, ErrorState, Spinner } from '../../components/ui'
import { statusTone } from './orderStatus'
import { useMyOrders } from './useCheckout'

export function OrdersPage() {
  const orders = useMyOrders()

  if (orders.isLoading) {
    return (
      <div className="grid place-items-center py-24">
        <Spinner />
      </div>
    )
  }

  /*
   * A staff account has no customer record, so it has no order history to
   * scope this list to and the API refuses it. That is correct, but it is
   * not a fault: showing the owner a red error box for signing in as the
   * owner reads like the site is broken. Tracking a specific order still
   * works for them, so point them at it.
   */
  if (orders.error?.status === 403) {
    return (
      <div className="rounded-card border border-ink-200 bg-white">
        <EmptyState
          icon={PackageSearch}
          title="This account does not place orders"
          description="Order history belongs to customer accounts. You can still look up any order by its number."
          action={
            <Link
              to="/track"
              className="inline-block rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
            >
              Track an order
            </Link>
          }
        />
      </div>
    )
  }

  if (orders.isError) return <ErrorState error={orders.error} onRetry={orders.refetch} />

  const rows = orders.data?.data ?? []

  if (rows.length === 0) {
    return (
      <div className="rounded-card border border-ink-200 bg-white">
        <EmptyState
          icon={PackageOpen}
          title="No orders yet"
          description="Once you order something it will show up here, with where it has got to."
          action={
            <Link
              to="/products"
              className="inline-block rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
            >
              Start shopping
            </Link>
          }
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-ink-900">My orders</h1>

      <ul className="flex flex-col gap-3">
        {rows.map((order) => (
          <li key={order.number}>
            <Link
              to={`/orders/${order.number}`}
              className="flex flex-wrap items-center gap-3 rounded-card border border-ink-200 bg-white p-4 transition-colors hover:border-brand-300"
            >
              <div className="min-w-0 flex-1">
                <p className="font-medium text-ink-900">{order.number}</p>
                <p className="mt-0.5 text-sm text-ink-500">
                  {date(order.placed_at)} · {(order.items ?? []).length} item
                  {(order.items ?? []).length === 1 ? '' : 's'}
                </p>
              </div>

              <Badge tone={statusTone(order.status)}>{order.status_label}</Badge>

              <span className="tabular font-semibold text-ink-900">{money(order.total)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
