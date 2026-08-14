import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ReceiptText, Search } from 'lucide-react'
import { get } from '../../lib/api'
import { cx, dateTime, money } from '../../lib/format'
import {
  Badge,
  EmptyState,
  ErrorState,
  Input,
  Pagination,
  Select,
  Spinner,
  TableWrap,
  Td,
  Th,
} from '../../components/ui'
import { statusTone } from '../checkout/orderStatus'

const STATUSES = [
  { value: '', label: 'All statuses' },
  { value: 'pending', label: 'Pending' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'packed', label: 'Packed' },
  { value: 'shipped', label: 'Shipped' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'returned', label: 'Returned (RTO)' },
]

/**
 * The tiles above the table.
 *
 * Counts AND value, because "12 orders pending" and "৳140,000 pending" are
 * different facts and the second is the one that decides what to do first.
 */
function StatusTiles({ summary, active, onPick }) {
  if (!summary) return null

  const tiles = ['pending', 'confirmed', 'packed', 'shipped'].map((key) => ({
    key,
    ...summary.by_status[key],
  }))

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {tiles.map((tile) => (
        <button
          key={tile.key}
          type="button"
          onClick={() => onPick(active === tile.key ? '' : tile.key)}
          className={cx(
            'rounded-card border bg-white p-3 text-left transition-colors',
            active === tile.key ? 'border-brand-600 ring-1 ring-brand-600' : 'border-ink-200 hover:border-brand-300',
          )}
        >
          <p className="text-sm text-ink-500">{tile.label}</p>
          <p className="tabular mt-1 text-xl font-semibold text-ink-900">{tile.orders}</p>
          <p className="tabular text-xs text-ink-500">{money(tile.value)}</p>
        </button>
      ))}
    </div>
  )
}

export default function AdminOrdersPage() {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)

  const query = useQuery({
    queryKey: ['admin', 'orders', { search, status, page }],
    queryFn: () =>
      get('/admin/orders', {
        params: { search: search || undefined, status: status || undefined, page },
      }),
    placeholderData: (previous) => previous,
  })

  const rows = query.data?.data ?? []

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-ink-900">Orders</h1>
        <p className="mt-0.5 text-sm text-ink-500">
          Confirm, pack, ship and deliver. Marking an order delivered is what records the sale.
        </p>
      </div>

      <StatusTiles
        summary={query.data?.summary}
        active={status}
        onPick={(next) => {
          setStatus(next)
          setPage(1)
        }}
      />

      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-48 flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400"
            aria-hidden="true"
          />
          <Input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value)
              setPage(1)
            }}
            placeholder="Order number, phone or name"
            aria-label="Search orders"
            className="pl-9"
          />
        </div>

        <Select
          value={status}
          onChange={(event) => {
            setStatus(event.target.value)
            setPage(1)
          }}
          aria-label="Filter by status"
          className="w-48"
        >
          {STATUSES.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </div>

      {query.isError ? (
        <ErrorState error={query.error} onRetry={query.refetch} />
      ) : query.isLoading ? (
        <div className="grid place-items-center py-16">
          <Spinner />
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-card border border-ink-200 bg-white">
          <EmptyState
            icon={ReceiptText}
            title={search || status ? 'No orders match' : 'No orders yet'}
            description={
              search || status
                ? 'Try a different search or clear the filter.'
                : 'Orders placed on the shop will appear here.'
            }
          />
        </div>
      ) : (
        <TableWrap>
          <table className="w-full text-sm">
            <thead>
              <tr>
                <Th>Order</Th>
                <Th>Customer</Th>
                <Th>Destination</Th>
                <Th>Payment</Th>
                <Th numeric>Total</Th>
                <Th numeric>Profit</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((order) => (
                <tr key={order.id} className="border-t border-ink-100 hover:bg-ink-50">
                  <Td>
                    <Link
                      to={`/admin/orders/${order.id}`}
                      className="font-medium text-brand-700 hover:underline"
                    >
                      {order.number}
                    </Link>
                    <p className="text-xs text-ink-500">{dateTime(order.placed_at)}</p>
                  </Td>
                  <Td>
                    <p className="text-ink-900">{order.customer}</p>
                    <p className="tabular text-xs text-ink-500">{order.phone}</p>
                  </Td>
                  <Td>{order.district}</Td>
                  <Td>
                    <p className="text-ink-700">{order.payment_method}</p>
                    {Number(order.due_total) > 0 && (
                      <p className="tabular text-xs text-warning-700">
                        {money(order.due_total)} due
                      </p>
                    )}
                  </Td>
                  <Td numeric className="font-medium">
                    {money(order.total)}
                  </Td>
                  <Td numeric>
                    {/* Blank until the goods ship: before that the cost is
                        genuinely unknown, and a zero would read as "no
                        margin" rather than "not yet". */}
                    {order.gross_profit === null ? (
                      <span className="text-ink-300">—</span>
                    ) : (
                      <span className={Number(order.gross_profit) < 0 ? 'text-danger-700' : 'text-success-700'}>
                        {money(order.gross_profit)}
                      </span>
                    )}
                  </Td>
                  <Td>
                    <Badge tone={statusTone(order.status)}>{order.status_label}</Badge>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}

      <Pagination meta={query.data?.meta} onPage={setPage} />
    </div>
  )
}
