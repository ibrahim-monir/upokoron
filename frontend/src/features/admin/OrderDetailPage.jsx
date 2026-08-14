import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Banknote, Phone, Truck } from 'lucide-react'
import { api, get } from '../../lib/api'
import { dateTime, money } from '../../lib/format'
import {
  Badge,
  Button,
  ErrorState,
  Input,
  Spinner,
  TableWrap,
  Td,
  Th,
  useToast,
} from '../../components/ui'
import { statusTone } from '../checkout/orderStatus'
import { useAuthStore } from '../../stores/authStore'

/**
 * Moving the order along.
 *
 * Only the steps the server says are legal are offered -- `next_statuses`
 * comes from the same state machine that enforces them, so the buttons can
 * never suggest something that would be refused.
 *
 * Delivered and Returned ask for confirmation: the first records the sale in
 * the books, the second sends the stock back. Neither can be undone from
 * here.
 */
function StatusActions({ order, onDone }) {
  const toast = useToast()
  const can = useAuthStore((state) => state.can)

  const mutation = useMutation({
    mutationFn: async ({ status, note }) => {
      const { data } = await api.put(`/admin/orders/${order.id}/status`, { status, note })

      return data
    },
    onSuccess() {
      toast.success('Order updated.')
      onDone()
    },
    onError(error) {
      toast.error(error?.message ?? 'Could not update the order.')
    },
  })

  if (!can('orders.status') || (order.next_statuses ?? []).length === 0) return null

  const confirmFor = {
    delivered: 'Mark this order delivered? This records the sale and the cost of goods in the accounts.',
    returned: 'Mark this order returned? The stock goes back and nothing is recorded as a sale.',
    cancelled: 'Cancel this order? The stock is released back to the shop.',
  }

  return (
    <div className="flex flex-wrap gap-2">
      {order.next_statuses.map((next) => (
        <Button
          key={next.value}
          variant={next.value === 'delivered' ? 'primary' : 'secondary'}
          size="sm"
          loading={mutation.isPending}
          onClick={() => {
            const question = confirmFor[next.value]

            if (question && !window.confirm(question)) return

            mutation.mutate({ status: next.value })
          }}
        >
          Mark {next.label}
        </Button>
      ))}
    </div>
  )
}

/** Recording money the courier or the customer handed over. */
function RecordPayment({ order, onDone }) {
  const toast = useToast()
  const can = useAuthStore((state) => state.can)
  const [amount, setAmount] = useState(order.due_total)
  const [reference, setReference] = useState('')

  const mutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.post(`/admin/orders/${order.id}/payments`, {
        amount: Number(amount),
        reference: reference || null,
      })

      return data
    },
    onSuccess() {
      toast.success('Payment recorded.')
      setReference('')
      onDone()
    },
    onError(error) {
      toast.error(error?.message ?? 'Could not record that payment.')
    },
  })

  if (!can('orders.payment') || Number(order.due_total) <= 0) return null

  return (
    <div className="rounded-card border border-ink-200 bg-white p-4">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-ink-900">
        <Banknote className="h-4 w-4 text-brand-600" aria-hidden="true" />
        Record payment
      </h2>

      <p className="mt-1 text-sm text-ink-500">
        {money(order.due_total)} outstanding
        {order.is_cod && ' — collected by the courier'}
      </p>

      <form
        className="mt-3 grid gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          mutation.mutate()
        }}
      >
        <Input
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          type="number"
          step="0.01"
          min="0.01"
          max={order.due_total}
          aria-label="Amount"
        />
        <Input
          value={reference}
          onChange={(event) => setReference(event.target.value)}
          placeholder="Reference (courier settlement, trx id)"
          aria-label="Reference"
        />
        <Button type="submit" loading={mutation.isPending} disabled={Number(amount) <= 0}>
          Record {money(amount || 0)}
        </Button>
      </form>
    </div>
  )
}

export default function AdminOrderDetailPage() {
  const { id } = useParams()
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: ['admin', 'orders', id],
    queryFn: () => get(`/admin/orders/${id}`),
    select: (response) => response.data,
  })

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['admin', 'orders'] })
  }

  if (query.isLoading) {
    return (
      <div className="grid place-items-center py-24">
        <Spinner />
      </div>
    )
  }

  if (query.isError) return <ErrorState error={query.error} onRetry={query.refetch} />

  const order = query.data

  return (
    <div className="flex flex-col gap-4">
      <Link
        to="/admin/orders"
        className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-ink-600 hover:text-brand-700"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        All orders
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink-900">{order.number}</h1>
          <p className="mt-0.5 text-sm text-ink-500">Placed {dateTime(order.placed_at)}</p>
        </div>

        <div className="flex items-center gap-2">
          <Badge tone={statusTone(order.status)}>{order.status_label}</Badge>
          <Badge tone={order.payment_status === 'paid' ? 'success' : 'warning'}>
            {order.payment_status_label}
          </Badge>
        </div>
      </div>

      <StatusActions order={order} onDone={refresh} />

      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <div className="flex flex-col gap-4">
          <TableWrap>
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <Th>Item</Th>
                  <Th numeric>Qty</Th>
                  <Th numeric>Price</Th>
                  <Th numeric>Total</Th>
                  <Th numeric>Cost</Th>
                  <Th numeric>Profit</Th>
                </tr>
              </thead>
              <tbody>
                {order.items.map((item) => (
                  <tr key={item.id} className="border-t border-ink-100">
                    <Td>
                      <p className="font-medium text-ink-900">{item.product_name}</p>
                      <p className="text-xs text-ink-500">
                        {[item.variation_name, item.sku].filter(Boolean).join(' · ')}
                      </p>
                    </Td>
                    <Td numeric>{Number(item.quantity)}</Td>
                    <Td numeric>{money(item.unit_price)}</Td>
                    <Td numeric className="font-medium">
                      {money(item.line_total)}
                    </Td>
                    <Td numeric>
                      {item.total_cost === null ? (
                        <span className="text-ink-300">—</span>
                      ) : (
                        money(item.total_cost)
                      )}
                    </Td>
                    <Td numeric>
                      {item.gross_profit === null ? (
                        <span className="text-ink-300">—</span>
                      ) : (
                        <span className="text-success-700">{money(item.gross_profit)}</span>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>

          <div className="rounded-card border border-ink-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-ink-900">Progress</h2>
            <ol className="mt-2 flex flex-col gap-2">
              {order.history.map((entry, index) => (
                <li key={index} className="flex flex-wrap items-baseline gap-2 text-sm">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" aria-hidden="true" />
                  <span className="font-medium text-ink-800">{entry.to_label}</span>
                  {entry.note && <span className="text-ink-500">— {entry.note}</span>}
                  <span className="ml-auto text-xs text-ink-500">
                    {entry.by ? `${entry.by} · ` : ''}
                    {dateTime(entry.at)}
                  </span>
                </li>
              ))}
            </ol>
          </div>

          {order.payments.length > 0 && (
            <div className="rounded-card border border-ink-200 bg-white p-4">
              <h2 className="text-sm font-semibold text-ink-900">Payments</h2>
              <ul className="mt-2 flex flex-col gap-2 text-sm">
                {order.payments.map((payment) => (
                  <li key={payment.id} className="flex flex-wrap items-baseline gap-2">
                    <span className="tabular font-medium text-ink-900">{payment.number}</span>
                    <span className={payment.is_refund ? 'text-danger-700' : 'text-success-700'}>
                      {money(payment.amount)}
                    </span>
                    {payment.reference && <span className="text-ink-500">{payment.reference}</span>}
                    <span className="ml-auto text-xs text-ink-500">{dateTime(payment.received_at)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-4">
          <div className="rounded-card border border-ink-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-ink-900">Totals</h2>
            <dl className="mt-2 flex flex-col gap-1.5 text-sm">
              <div className="flex justify-between">
                <dt className="text-ink-600">Subtotal</dt>
                <dd className="tabular">{money(order.subtotal)}</dd>
              </div>
              {Number(order.discount_total) > 0 && (
                <div className="flex justify-between">
                  <dt className="text-ink-600">Discount</dt>
                  <dd className="tabular text-accent-600">− {money(order.discount_total)}</dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-ink-600">Delivery</dt>
                <dd className="tabular">{money(order.shipping_charge)}</dd>
              </div>
              <div className="flex justify-between border-t border-ink-100 pt-1.5 font-semibold">
                <dt>Total</dt>
                <dd className="tabular text-brand-700">{money(order.total)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-600">Paid</dt>
                <dd className="tabular">{money(order.paid_total)}</dd>
              </div>
              {Number(order.due_total) > 0 && (
                <div className="flex justify-between">
                  <dt className="text-ink-600">Due</dt>
                  <dd className="tabular font-semibold text-warning-700">{money(order.due_total)}</dd>
                </div>
              )}

              {order.gross_profit !== null && (
                <div className="flex justify-between border-t border-ink-100 pt-1.5">
                  <dt className="text-ink-600">Gross profit</dt>
                  <dd className="tabular font-semibold text-success-700">{money(order.gross_profit)}</dd>
                </div>
              )}
            </dl>
          </div>

          <RecordPayment order={order} onDone={refresh} />

          <div className="rounded-card border border-ink-200 bg-white p-4">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-ink-900">
              <Truck className="h-4 w-4 text-brand-600" aria-hidden="true" />
              Delivering to
            </h2>
            <p className="mt-2 text-sm font-medium text-ink-900">{order.shipping.name}</p>
            <p className="tabular flex items-center gap-1.5 text-sm text-ink-600">
              <Phone className="h-3.5 w-3.5" aria-hidden="true" />
              {order.shipping.phone}
            </p>
            <p className="mt-1 text-sm text-ink-600">
              {[
                order.shipping.address_line1,
                order.shipping.address_line2,
                order.shipping.area,
                order.shipping.city,
                order.shipping.district,
              ]
                .filter(Boolean)
                .join(', ')}
            </p>
            <p className="mt-2 text-xs text-ink-500">
              {order.shipping.zone} · {order.shipping.method} · {order.payment_method}
            </p>

            {order.customer_note && (
              <p className="mt-3 rounded-lg bg-warning-50 p-2 text-sm text-warning-700">
                “{order.customer_note}”
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
