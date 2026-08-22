import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, ExternalLink, Loader2, X } from 'lucide-react'

import { get, put } from '../../lib/api'
import { cx, dateTime, money, quantity, relativeTime } from '../../lib/format'
import { useAuthStore } from '../../stores/authStore'
import { Badge, Spinner, useToast } from '../../components/ui'
import { statusTone } from '../checkout/orderStatus'

/**
 * Statuses that end the order's life.
 *
 * This mirrors `OrderStatus::isFinal()` on the API, and is used only to
 * decide whether to ask before moving -- never to decide what is allowed.
 * The server owns the state machine and rejects anything it does not permit,
 * so if this list ever drifts the worst that happens is a missing prompt,
 * not an illegal transition.
 *
 * The forward steps of the day -- confirm, pack, ship -- deliberately do not
 * prompt. Someone works through thirty of those before lunch, and a
 * confirmation on each is how people learn to dismiss confirmations.
 */
const NEEDS_CONFIRMING = {
  delivered: 'Mark this order delivered? That books the sale and cannot be undone here.',
  cancelled: 'Cancel this order? Reserved stock goes back and the order closes for good.',
  returned: 'Mark this order returned? The parcel came back and the order closes for good.',
}


/* -------------------------------------------------------
   Status control
------------------------------------------------------- */

/**
 * The status badge, and the move to the next one, in the same place.
 *
 * The options come from `next_statuses` on the row the API already sent, so
 * opening this costs nothing and can only ever offer a legal move. When
 * there is nowhere left to go it is a plain badge, which is the honest
 * rendering of a finished order -- not a dropdown that opens onto nothing.
 */
export function OrderStatusControl({ order, size = 'sm' }) {
  const can = useAuthStore((state) => state.can)
  const queryClient = useQueryClient()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)

  const options = order.next_statuses ?? []
  const editable = can('orders.status') && options.length > 0

  const move = useMutation({
    mutationFn: (status) => put(`/admin/orders/${order.id}/status`, { status }),
    onSuccess(data) {
      toast.success(data?.message ?? 'Order updated.')
      // The row, the status tiles, the sidebar badge and the dashboard all
      // read from these; a status move changes every one of them.
      queryClient.invalidateQueries({ queryKey: ['admin', 'orders'] })
      queryClient.invalidateQueries({ queryKey: ['admin', 'order', order.id] })
      queryClient.invalidateQueries({ queryKey: ['admin', 'dashboard'] })
    },
    onError(error) {
      toast.error(error?.message ?? 'Could not update this order.')
    },
  })

  useEffect(() => {
    if (!open) return undefined

    const close = (event) => {
      if (!wrapRef.current?.contains(event.target)) setOpen(false)
    }

    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  const pick = (option) => {
    setOpen(false)

    const question = NEEDS_CONFIRMING[option.value]
    if (question && !window.confirm(question)) return

    move.mutate(option.value)
  }

  if (!editable) {
    return <Badge tone={statusTone(order.status)}>{order.status_label}</Badge>
  }

  return (
    <div ref={wrapRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        disabled={move.isPending}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Status: ${order.status_label}. Change it.`}
        className={cx(
          'inline-flex items-center gap-1.5 rounded-full border border-transparent',
          'font-medium transition disabled:opacity-60',
          size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm',
          'hover:border-ink-300 hover:shadow-sm',
          STATUS_PILL[statusTone(order.status)],
        )}
      >
        {move.isPending ? (
          <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
        ) : null}
        {order.status_label}
        <ChevronDown
          className={cx('h-3 w-3 transition-transform', open && 'rotate-180')}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute left-0 z-30 mt-1 w-48 overflow-hidden rounded-xl border border-ink-200 bg-white py-1 shadow-raised"
        >
          <p className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.1em] text-ink-400">
            Move to
          </p>

          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              role="menuitem"
              onClick={() => pick(option)}
              className={cx(
                'flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold',
                option.value === 'cancelled' || option.value === 'returned'
                  ? 'text-danger-700 hover:bg-danger-50'
                  : 'text-ink-700 hover:bg-ink-50',
              )}
            >
              <span
                className={cx('h-1.5 w-1.5 rounded-full', STATUS_DOT[statusTone(option.value)])}
                aria-hidden="true"
              />
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

const STATUS_PILL = {
  neutral: 'bg-ink-100 text-ink-700',
  brand: 'bg-brand-50 text-brand-800',
  accent: 'bg-accent-50 text-accent-700',
  success: 'bg-success-50 text-success-700',
  warning: 'bg-warning-50 text-warning-700',
  danger: 'bg-danger-50 text-danger-700',
}

const STATUS_DOT = {
  neutral: 'bg-ink-400',
  brand: 'bg-brand-500',
  accent: 'bg-accent-500',
  success: 'bg-success-500',
  warning: 'bg-warning-500',
  danger: 'bg-danger-500',
}


/* -------------------------------------------------------
   Quick view
------------------------------------------------------- */

function Row({ label, value, strong = false, tone }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1">
      <span className="text-xs text-ink-500">{label}</span>
      <span
        className={cx(
          'tabular text-right',
          strong ? 'text-sm font-bold text-ink-900' : 'text-xs font-medium text-ink-800',
          tone === 'danger' && 'text-danger-700',
          tone === 'success' && 'text-success-700',
        )}
      >
        {value}
      </span>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <section className="border-t border-ink-100 px-5 py-4">
      <h3 className="mb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-ink-400">
        {title}
      </h3>
      {children}
    </section>
  )
}

/**
 * The whole order without leaving the list.
 *
 * Most of what anyone opens an order for is a look: what did they buy, where
 * is it going, has it been paid. That is a read, and it should not cost a
 * page load and a trip back. Anything that writes beyond moving the status
 * still lives on the full page, and the footer link goes straight there.
 */
export function OrderQuickView({ orderId, onClose }) {
  const closeRef = useRef(null)

  const query = useQuery({
    queryKey: ['admin', 'order', orderId],
    queryFn: () => get(`/admin/orders/${orderId}`),
    select: (response) => response.data,
    enabled: Boolean(orderId),
  })

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') onClose()
    }

    document.addEventListener('keydown', onKey)
    closeRef.current?.focus()

    // The list behind the panel must not scroll while the panel is open.
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = previous
    }
  }, [onClose])

  const order = query.data

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label="Close quick view"
        onClick={onClose}
        className="absolute inset-0 bg-ink-950/40 backdrop-blur-[2px]"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Order quick view"
        className="relative flex h-full w-full max-w-md flex-col bg-white shadow-2xl sm:max-w-lg"
      >
        <header className="flex items-start gap-3 border-b border-ink-200 px-5 py-4">
          <div className="min-w-0 flex-1">
            {query.isLoading ? (
              <div className="h-5 w-32 animate-pulse rounded bg-ink-100" />
            ) : (
              <>
                <p className="truncate text-base font-bold text-ink-900">{order?.number}</p>
                <p className="mt-0.5 text-xs text-ink-500">
                  Placed {relativeTime(order?.placed_at)} · {dateTime(order?.placed_at)}
                </p>
              </>
            )}
          </div>

          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-ink-400 transition hover:bg-ink-100 hover:text-ink-900"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {query.isLoading ? (
            <div className="grid place-items-center py-20">
              <Spinner />
            </div>
          ) : query.isError ? (
            <p className="px-5 py-10 text-center text-sm text-danger-700">
              {query.error?.message ?? 'Could not load this order.'}
            </p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2 px-5 py-4">
                <OrderStatusControl order={order} size="md" />

                <Badge tone={Number(order.due_total) > 0 ? 'warning' : 'success'}>
                  {Number(order.due_total) > 0
                    ? `${money(order.due_total)} due`
                    : order.payment_status_label}
                </Badge>

                {order.is_cod && <Badge tone="neutral">Cash on delivery</Badge>}
              </div>

              <Section title="Delivering to">
                <p className="text-sm font-semibold text-ink-900">{order.shipping?.name}</p>
                <p className="tabular text-xs text-ink-600">{order.shipping?.phone}</p>
                <p className="mt-1 text-xs leading-relaxed text-ink-600">
                  {[
                    order.shipping?.address_line1,
                    order.shipping?.address_line2,
                    order.shipping?.area,
                    order.shipping?.city,
                    order.shipping?.district,
                    order.shipping?.postcode,
                  ]
                    .filter(Boolean)
                    .join(', ')}
                </p>
                {order.shipping?.method && (
                  <p className="mt-1 text-xs text-ink-400">via {order.shipping.method}</p>
                )}
              </Section>

              <Section title={`Items (${order.items?.length ?? 0})`}>
                <ul className="divide-y divide-ink-100">
                  {(order.items ?? []).map((item) => (
                    <li key={item.id} className="flex items-start gap-3 py-2">
                      <span className="mt-0.5 grid h-6 min-w-6 shrink-0 place-items-center rounded-md bg-ink-100 px-1 text-[11px] font-bold tabular text-ink-600">
                        {quantity(item.quantity)}
                      </span>

                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-ink-900">{item.product_name}</p>
                        {item.variation_name && (
                          <p className="text-[11px] text-ink-500">{item.variation_name}</p>
                        )}
                        <p className="tabular text-[11px] text-ink-400">
                          {item.sku} · {money(item.unit_price)} each
                        </p>
                      </div>

                      <span className="tabular text-xs font-bold text-ink-900">
                        {money(item.line_total)}
                      </span>
                    </li>
                  ))}
                </ul>
              </Section>

              <Section title="Totals">
                <Row label="Subtotal" value={money(order.subtotal)} />
                {Number(order.discount_total) > 0 && (
                  <Row label="Discount" value={`− ${money(order.discount_total)}`} />
                )}
                <Row label="Delivery" value={money(order.shipping_charge)} />
                {Number(order.extra_charge) > 0 && (
                  <Row label="Extra charge" value={money(order.extra_charge)} />
                )}

                <div className="my-1 border-t border-ink-100" />

                <Row label="Total" value={money(order.total)} strong />
                <Row label="Paid" value={money(order.paid_total)} />
                {Number(order.due_total) > 0 && (
                  <Row label="Due" value={money(order.due_total)} tone="danger" strong />
                )}

                {order.gross_profit !== null && order.gross_profit !== undefined && (
                  <Row
                    label="Gross profit"
                    value={money(order.gross_profit)}
                    tone={Number(order.gross_profit) < 0 ? 'danger' : 'success'}
                  />
                )}
              </Section>

              {order.customer_note && (
                <Section title="Customer note">
                  <p className="text-xs leading-relaxed text-ink-700">{order.customer_note}</p>
                </Section>
              )}

              {(order.history ?? []).length > 0 && (
                <Section title="History">
                  <ol className="space-y-2">
                    {order.history.map((entry, index) => (
                      <li key={`${entry.at}-${index}`} className="flex gap-2.5">
                        <span
                          className={cx(
                            'mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full',
                            STATUS_DOT[statusTone(entry.to)],
                          )}
                          aria-hidden="true"
                        />
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-ink-800">{entry.to_label}</p>
                          <p className="text-[11px] text-ink-400">
                            {dateTime(entry.at)}
                            {entry.by ? ` · ${entry.by}` : ''}
                          </p>
                          {entry.note && (
                            <p className="mt-0.5 text-[11px] text-ink-600">{entry.note}</p>
                          )}
                        </div>
                      </li>
                    ))}
                  </ol>
                </Section>
              )}
            </>
          )}
        </div>

        <footer className="border-t border-ink-200 px-5 py-3">
          <Link
            to={`/admin/orders/${orderId}`}
            onClick={onClose}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-brand-700 transition hover:text-brand-800"
          >
            Open the full order
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </footer>
      </div>
    </div>
  )
}
