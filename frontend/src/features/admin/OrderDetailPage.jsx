import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  Banknote,
  CalendarDays,
  Check,
  ChevronDown,
  Clock3,
  Copy,
  CreditCard,
  MapPin,
  Package,
  Phone,
  Save,
  ShoppingBag,
  Printer,
  Truck,
  UserRound,
} from 'lucide-react'
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

const FALLBACK_STATUSES = [
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
  { value: 'returned', label: 'Returned' },
]

function normalizeStatus(item) {
  if (!item) return null

  if (typeof item === 'string') {
    const fallback = FALLBACK_STATUSES.find((status) => status.value === item)

    return {
      value: item,
      label:
        fallback?.label ??
        item
          .replace(/[_-]+/g, ' ')
          .replace(/\b\w/g, (letter) => letter.toUpperCase()),
    }
  }

  if (typeof item === 'object') {
    const value = item.value ?? item.status ?? item.key
    if (!value) return null

    return {
      value,
      label:
        item.label ??
        item.name ??
        item.status_label ??
        value
          .replace(/[_-]+/g, ' ')
          .replace(/\b\w/g, (letter) => letter.toUpperCase()),
    }
  }

  return null
}

function getStatusOptions(order) {
  const current = normalizeStatus({
    value: order.status,
    label: order.status_label,
  })

  const serverNext = Array.isArray(order.next_statuses)
    ? order.next_statuses.map(normalizeStatus).filter(Boolean)
    : []

  const source = serverNext.length
    ? [current, ...serverNext]
    : [
        current,
        ...FALLBACK_STATUSES.filter(
          (item) => item.value !== order.status,
        ),
      ]

  return source.filter(
    (item, index, array) =>
      item &&
      array.findIndex((candidate) => candidate.value === item.value) === index,
  )
}

function StatusPill({ status, label }) {
  return (
    <Badge tone={statusTone(status)}>
      {label}
    </Badge>
  )
}

function StatusEditor({ order, onDone }) {
  const toast = useToast()
  const [status, setStatus] = useState(order.status)

  const options = useMemo(
    () => getStatusOptions(order),
    [order.status, order.status_label, order.next_statuses],
  )

  useEffect(() => {
    setStatus(order.status)
  }, [order.status])

  const selected = options.find((item) => item.value === status)
  const changed = status !== order.status

  const mutation = useMutation({
    mutationFn: async (nextStatus) => {
      const response = await api.put(
        `/admin/orders/${order.id}/status`,
        { status: nextStatus },
      )

      return response?.data
    },
    onSuccess: () => {
      toast.success('Order status updated successfully.')
      onDone()
    },
    onError: (error) => {
      toast.error(
        error?.response?.data?.message ??
          error?.message ??
          'Could not update the order status.',
      )
    },
  })

  const save = () => {
    if (!changed || mutation.isPending) return

    const destructive = {
      delivered:
        'Mark this order as delivered? This will record the sale and related accounting entries.',
      returned:
        'Mark this order as returned? Stock will be released back and the order will not be recorded as a sale.',
      cancelled:
        'Cancel this order? The order will be released according to the backend order rules.',
    }

    if (
      destructive[status] &&
      !window.confirm(destructive[status])
    ) {
      return
    }

    mutation.mutate(status)
  }

  return (
    <>
      <section className="relative overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-sm">
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-brand-600 via-brand-500 to-cyan-400" />

        <div className="flex flex-col gap-5 p-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-4">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-800">
              <Clock3 className="h-5 w-5" />
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-400">
                Order workflow
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <StatusPill
                  status={order.status}
                  label={order.status_label}
                />
                {changed && (
                  <span className="text-xs font-medium text-warning-700">
                    Unsaved change
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto">
            <div className="relative min-w-0 flex-1 sm:min-w-[260px] lg:w-[280px]">
              <select
                value={status}
                onChange={(event) => setStatus(event.target.value)}
                disabled={mutation.isPending}
                aria-label="Order status"
                className="h-11 w-full appearance-none rounded-xl border border-ink-200 bg-white px-3 pr-10 text-sm font-medium text-ink-800 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                    {option.value === order.status ? ' — Current' : ''}
                  </option>
                ))}
              </select>

              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
            </div>

            <Button
              type="button"
              variant="primary"
              loading={mutation.isPending}
              disabled={!changed}
              onClick={save}
              className="h-11 rounded-xl px-5"
            >
              <Save className="h-4 w-4" />
              Save status
            </Button>
          </div>
        </div>

        {options.length > 1 && (
          <div className="border-t border-ink-100 bg-ink-50/60 px-5 py-3">
            <div className="flex flex-wrap items-center gap-2">
              {options.map((option, index) => {
                const active = option.value === status

                return (
                  <div key={option.value} className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setStatus(option.value)}
                      className={[
                        'rounded-full px-3 py-1.5 text-xs font-semibold transition',
                        active
                          ? 'bg-brand-600 text-white shadow-sm'
                          : 'bg-white text-ink-500 ring-1 ring-inset ring-ink-200 hover:bg-brand-50 hover:text-brand-800',
                      ].join(' ')}
                    >
                      {option.label}
                    </button>

                    {index < options.length - 1 && (
                      <span className="text-ink-300">→</span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </section>

      {changed && (
        <div className="fixed inset-x-4 bottom-4 z-50 sm:left-auto sm:w-[440px]">
          <div className="flex items-center gap-3 rounded-2xl border border-ink-200 bg-white/95 p-3 shadow-2xl backdrop-blur-xl">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-warning-50 text-warning-700">
              <Save className="h-4 w-4" />
            </div>

            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-ink-900">
                Unsaved status change
              </p>
              <p className="truncate text-xs text-ink-500">
                {selected?.label ?? status}
              </p>
            </div>

            <Button
              type="button"
              variant="primary"
              loading={mutation.isPending}
              onClick={save}
              className="shrink-0 rounded-xl"
            >
              <Check className="h-4 w-4" />
              Save
            </Button>
          </div>
        </div>
      )}

    </>
  )
}

function Metric({ icon: Icon, label, value, tone = 'brand' }) {
  const tones = {
    brand: 'bg-brand-50 text-brand-800',
    success: 'bg-success-50 text-success-700',
    warning: 'bg-warning-50 text-warning-700',
    ink: 'bg-ink-100 text-ink-700',
  }

  return (
    <div className="flex items-center gap-3 rounded-xl border border-ink-100 bg-white p-3">
      <div className={`grid h-9 w-9 place-items-center rounded-lg ${tones[tone]}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-400">
          {label}
        </p>
        <p className="mt-0.5 truncate text-sm font-semibold text-ink-900">
          {value}
        </p>
      </div>
    </div>
  )
}

function SectionCard({ title, icon: Icon, action, children, className = '' }) {
  return (
    <section
      className={`rounded-2xl border border-ink-200 bg-white shadow-sm ${className}`}
    >
      <div className="flex items-center justify-between border-b border-ink-100 px-5 py-4">
        <div className="flex items-center gap-2.5">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-ink-50 text-ink-600">
            <Icon className="h-4 w-4" />
          </div>
          <h2 className="text-sm font-bold text-ink-900">{title}</h2>
        </div>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </section>
  )
}

function RecordPayment({ order, onDone }) {
  const toast = useToast()
  const [amount, setAmount] = useState(order.due_total)

  // Prefilled with the id the customer submitted, since on a bKash order
  // that is almost always the reference being recorded -- and retyping a
  // ten-character id off another panel is how digits get transposed.
  const [reference, setReference] = useState(order.payment_reference ?? '')

  const mutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.post(
        `/admin/orders/${order.id}/payments`,
        {
          amount: Number(amount),
          reference: reference || null,
        },
      )

      return data
    },
    onSuccess: () => {
      toast.success('Payment recorded.')
      setReference('')
      onDone()
    },
    onError: (error) => {
      toast.error(
        error?.response?.data?.message ??
          error?.message ??
          'Could not record payment.',
      )
    },
  })

  if (Number(order.due_total) <= 0) return null

  return (
    <SectionCard title="Record payment" icon={Banknote}>
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault()
          if (Number(amount) > 0) mutation.mutate()
        }}
      >
        <div className="rounded-xl bg-warning-50 p-3">
          <p className="text-xs font-medium text-warning-700">Outstanding</p>
          <p className="mt-1 text-xl font-bold tabular text-warning-900">
            {money(order.due_total)}
          </p>
        </div>

        {/*
          The customer's own claim, and nothing more -- it moved no money and
          marked nothing paid. Check it against the statement before pressing
          the button below.
        */}
        {order.payment_reference && (
          <div className="rounded-xl bg-brand-50 p-3">
            <p className="text-xs font-medium text-brand-700">Customer says they paid</p>
            <p className="mt-1 text-sm font-bold tabular text-brand-900">
              {order.payment_reference}
            </p>
            {order.payment_reference_at && (
              <p className="mt-0.5 text-[11px] text-brand-700">
                submitted {dateTime(order.payment_reference_at)} — unverified
              </p>
            )}
          </div>
        )}

        <Input
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          type="number"
          step="0.01"
          min="0.01"
          max={order.due_total}
          aria-label="Payment amount"
        />

        <Input
          value={reference}
          onChange={(event) => setReference(event.target.value)}
          placeholder="Transaction / courier reference"
          aria-label="Payment reference"
        />

        <Button
          type="submit"
          loading={mutation.isPending}
          disabled={Number(amount) <= 0}
          className="w-full"
        >
          <Banknote className="h-4 w-4" />
          Record payment
        </Button>
      </form>
    </SectionCard>
  )
}


function InvoicePrintStyles() {
  return (
    <style>{`
      .invoice-print-root {
        display: none;
      }

      @media print {
        @page {
          size: A4;
          margin: 12mm;
        }

        html,
        body {
          background: #fff !important;
          margin: 0 !important;
          padding: 0 !important;
        }

        body * {
          visibility: hidden !important;
        }

        .invoice-print-root,
        .invoice-print-root * {
          visibility: visible !important;
        }

        .invoice-print-root {
          display: block !important;
          position: absolute !important;
          inset: 0 !important;
          width: 100% !important;
          background: #fff !important;
          color: #111827 !important;
        }

        .invoice-sheet {
          width: 100%;
          max-width: 186mm;
          min-height: 270mm;
          margin: 0 auto;
          padding: 2mm 0;
          box-sizing: border-box;
          font-family: Arial, Helvetica, sans-serif;
          font-size: 10px;
          color: #111827;
        }

        .invoice-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 20px;
        }

        .invoice-brand {
          font-size: 24px;
          line-height: 1;
          font-weight: 800;
          letter-spacing: .08em;
        }

        .invoice-title-block {
          text-align: right;
        }

        .invoice-title {
          font-size: 22px;
          font-weight: 800;
          letter-spacing: .12em;
        }

        .invoice-number {
          margin-top: 5px;
          font-size: 11px;
          font-weight: 700;
        }

        .invoice-muted {
          color: #6b7280;
          font-size: 9px;
          line-height: 1.5;
        }

        .invoice-rule {
          height: 1px;
          background: #d1d5db;
          margin: 14px 0 18px;
        }

        .invoice-meta-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 30px;
          margin-bottom: 22px;
        }

        .invoice-meta-right {
          justify-self: end;
          width: 75%;
        }

        .invoice-meta-right > div {
          display: flex;
          justify-content: space-between;
          gap: 20px;
          padding: 4px 0;
          border-bottom: 1px solid #f3f4f6;
        }

        .invoice-label {
          display: block;
          margin-bottom: 4px;
          color: #6b7280;
          font-size: 8px;
          font-weight: 700;
          letter-spacing: .1em;
        }

        .invoice-value {
          font-size: 9px;
          font-weight: 700;
          text-align: right;
        }

        .invoice-strong {
          font-weight: 700;
        }

        .invoice-text {
          margin-top: 2px;
          font-size: 9px;
          line-height: 1.45;
        }

        .invoice-table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 8px;
        }

        .invoice-table th {
          padding: 8px 7px;
          background: #f3f4f6;
          border-top: 1px solid #d1d5db;
          border-bottom: 1px solid #d1d5db;
          color: #4b5563;
          font-size: 8px;
          font-weight: 700;
          letter-spacing: .06em;
          text-align: left;
        }

        .invoice-table td {
          padding: 9px 7px;
          border-bottom: 1px solid #e5e7eb;
          vertical-align: top;
          font-size: 9px;
        }

        .invoice-number-cell {
          text-align: right !important;
          white-space: nowrap;
        }

        .invoice-bottom {
          display: grid;
          grid-template-columns: 1fr 82mm;
          gap: 20px;
          margin-top: 24px;
          align-items: start;
        }

        .invoice-note {
          padding-right: 15px;
        }

        .invoice-note p {
          margin: 0;
          color: #4b5563;
          font-size: 9px;
          line-height: 1.55;
        }

        .invoice-note-heading {
          margin-top: 18px;
        }

        .invoice-totals {
          border-top: 1px solid #d1d5db;
        }

        .invoice-totals > div {
          display: flex;
          justify-content: space-between;
          gap: 20px;
          padding: 6px 0;
          font-size: 9px;
        }

        .invoice-grand-total {
          margin: 4px 0;
          padding: 9px 0 !important;
          border-top: 1px solid #111827;
          border-bottom: 1px solid #111827;
          font-size: 12px !important;
          font-weight: 800;
        }

        .invoice-due {
          font-weight: 800;
        }

        .invoice-footer {
          display: flex;
          justify-content: space-between;
          gap: 20px;
          margin-top: 35px;
          padding-top: 10px;
          border-top: 1px solid #e5e7eb;
          color: #9ca3af;
          font-size: 8px;
        }
      }
    `}</style>
  )
}

function InvoiceDocument({ order }) {
  const customerName =
    order.shipping?.name ??
    order.customer ??
    'Customer'

  const customerPhone =
    order.shipping?.phone ??
    order.phone ??
    '—'

  const address = [
    order.shipping?.address_line1,
    order.shipping?.address_line2,
    order.shipping?.area,
    order.shipping?.city,
    order.shipping?.district,
  ]
    .filter(Boolean)
    .join(', ')

  const items = order.items ?? []

  return (
    <div className="invoice-print-root">
      <div className="invoice-sheet">
        <header className="invoice-header">
          <div>
            <div className="invoice-brand">UPOKORON</div>
            <p className="invoice-muted">Online Electronics &amp; Components</p>
          </div>

          <div className="invoice-title-block">
            <div className="invoice-title">INVOICE</div>
            <div className="invoice-number">{order.number}</div>
            <div className="invoice-muted">{dateTime(order.placed_at)}</div>
          </div>
        </header>

        <div className="invoice-rule" />

        <section className="invoice-meta-grid">
          <div>
            <div className="invoice-label">BILL TO</div>
            <div className="invoice-strong">{customerName}</div>
            <div className="invoice-text">{customerPhone}</div>
            <div className="invoice-text">{address || 'No shipping address'}</div>
          </div>

          <div className="invoice-meta-right">
            <div>
              <span className="invoice-label">STATUS</span>
              <span className="invoice-value">{order.status_label}</span>
            </div>
            <div>
              <span className="invoice-label">PAYMENT</span>
              <span className="invoice-value">{order.payment_method || '—'}</span>
            </div>
            <div>
              <span className="invoice-label">PAYMENT STATUS</span>
              <span className="invoice-value">{order.payment_status_label}</span>
            </div>
          </div>
        </section>

        <table className="invoice-table">
          <thead>
            <tr>
              <th>ITEM</th>
              <th>SKU</th>
              <th className="invoice-number-cell">QTY</th>
              <th className="invoice-number-cell">UNIT PRICE</th>
              <th className="invoice-number-cell">TOTAL</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td>
                  <div className="invoice-strong">{item.product_name}</div>
                  {item.variation_name && (
                    <div className="invoice-muted">{item.variation_name}</div>
                  )}
                </td>
                <td>{item.sku || '—'}</td>
                <td className="invoice-number-cell">{Number(item.quantity)}</td>
                <td className="invoice-number-cell">{money(item.unit_price)}</td>
                <td className="invoice-number-cell invoice-strong">
                  {money(item.line_total)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <section className="invoice-bottom">
          <div className="invoice-note">
            <div className="invoice-label">THANK YOU</div>
            <p>
              Thank you for shopping with Upokoron. Please keep this invoice
              for your records.
            </p>
            {order.customer_note && (
              <>
                <div className="invoice-label invoice-note-heading">CUSTOMER NOTE</div>
                <p>{order.customer_note}</p>
              </>
            )}
          </div>

          <div className="invoice-totals">
            <div>
              <span>Subtotal</span>
              <strong>{money(order.subtotal)}</strong>
            </div>

            {Number(order.discount_total) > 0 && (
              <div>
                <span>Discount</span>
                <strong>− {money(order.discount_total)}</strong>
              </div>
            )}

            <div>
              <span>Delivery</span>
              <strong>{money(order.shipping_charge)}</strong>
            </div>

            <div className="invoice-grand-total">
              <span>Grand Total</span>
              <strong>{money(order.total)}</strong>
            </div>

            <div>
              <span>Paid</span>
              <strong>{money(order.paid_total)}</strong>
            </div>

            <div className="invoice-due">
              <span>Due</span>
              <strong>{money(order.due_total)}</strong>
            </div>
          </div>
        </section>

        <footer className="invoice-footer">
          <span>Generated from Upokoron Admin</span>
          <span>{order.number}</span>
        </footer>
      </div>
    </div>
  )
}

function PrintInvoiceButton({ order }) {
  const [printing, setPrinting] = useState(false)

  const printInvoice = () => {
    setPrinting(true)

    // Let React render the print-only invoice before invoking the browser print dialog.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.print()
        setPrinting(false)
      })
    })
  }

  return (
    <button
      type="button"
      onClick={printInvoice}
      disabled={printing}
      className="inline-flex h-10 items-center gap-2 rounded-xl border border-brand-200 bg-brand-50 px-3.5 text-sm font-semibold text-brand-800 shadow-sm transition hover:border-brand-300 hover:bg-brand-100 disabled:cursor-wait disabled:opacity-60"
    >
      <Printer className="h-4 w-4" />
      {printing ? 'Preparing…' : 'Print Invoice'}
    </button>
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
    queryClient.invalidateQueries({
      queryKey: ['admin', 'orders', id],
    })
    queryClient.invalidateQueries({
      queryKey: ['admin', 'orders'],
    })
  }

  if (query.isLoading) {
    return (
      <div className="grid min-h-[60vh] place-items-center">
        <Spinner />
      </div>
    )
  }

  if (query.isError) {
    return <ErrorState error={query.error} onRetry={query.refetch} />
  }

  const order = query.data

  const customerName =
    order.shipping?.name ??
    order.customer ??
    'Customer'

  const customerPhone =
    order.shipping?.phone ??
    order.phone ??
    '—'

  const address = [
    order.shipping?.address_line1,
    order.shipping?.address_line2,
    order.shipping?.area,
    order.shipping?.city,
    order.shipping?.district,
  ]
    .filter(Boolean)
    .join(', ')

  const items = order.items ?? []
  const history = order.history ?? []
  const payments = order.payments ?? []

  return (
    <>
      <InvoicePrintStyles />
      <InvoiceDocument order={order} />

      <div className="min-h-full bg-ink-50/40 pb-24">
      <div className="mx-auto max-w-[1500px] space-y-5">

        {/* Header */}
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <Link
              to="/admin/orders"
              className="mt-1 grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-ink-200 bg-white text-ink-500 shadow-sm transition hover:border-brand-300 hover:bg-brand-50 hover:text-brand-800"
              aria-label="Back to orders"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>

            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-bold tracking-tight text-ink-950">
                  {order.number}
                </h1>
                <StatusPill
                  status={order.status}
                  label={order.status_label}
                />
              </div>

              <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-500">
                <span className="inline-flex items-center gap-1.5">
                  <CalendarDays className="h-3.5 w-3.5" />
                  {dateTime(order.placed_at)}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <ShoppingBag className="h-3.5 w-3.5" />
                  {items.length} item{items.length === 1 ? '' : 's'}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Badge
              tone={
                order.payment_status === 'paid'
                  ? 'success'
                  : 'warning'
              }
            >
              {order.payment_status_label}
            </Badge>

            <PrintInvoiceButton order={order} />

            <button
              type="button"
              onClick={() =>
                navigator.clipboard?.writeText(order.number)
              }
              className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-ink-200 bg-white px-3 text-xs font-semibold text-ink-600 shadow-sm hover:bg-ink-50"
            >
              <Copy className="h-3.5 w-3.5" />
              Copy order ID
            </button>
          </div>
        </div>

        {/* Status */}
        <StatusEditor order={order} onDone={refresh} />

        {/* KPI strip */}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric
            icon={CreditCard}
            label="Order total"
            value={money(order.total)}
          />
          <Metric
            icon={Check}
            label="Paid"
            value={money(order.paid_total)}
            tone="success"
          />
          <Metric
            icon={Banknote}
            label="Due"
            value={money(order.due_total)}
            tone={Number(order.due_total) > 0 ? 'warning' : 'success'}
          />
          <Metric
            icon={Package}
            label="Gross profit"
            value={
              order.gross_profit === null
                ? 'Not available'
                : money(order.gross_profit)
            }
            tone="brand"
          />
        </div>

        {/* Main content */}
        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">

          {/* Left */}
          <div className="space-y-5">
            <SectionCard
              title="Order items"
              icon={Package}
              action={
                <span className="rounded-full bg-ink-50 px-2.5 py-1 text-xs font-semibold text-ink-500">
                  {items.length} products
                </span>
              }
            >
              <div className="overflow-hidden rounded-xl border border-ink-100">
                <TableWrap>
                  <table className="w-full text-sm">
                    <thead className="bg-ink-50/80">
                      <tr>
                        <Th>Product</Th>
                        <Th numeric>Qty</Th>
                        <Th numeric>Price</Th>
                        <Th numeric>Total</Th>
                        <Th numeric>Cost</Th>
                        <Th numeric>Profit</Th>
                      </tr>
                    </thead>

                    <tbody>
                      {items.map((item) => (
                        <tr
                          key={item.id}
                          className="border-t border-ink-100"
                        >
                          <Td>
                            <div className="flex items-center gap-3">
                              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-ink-50 text-ink-400">
                                <Package className="h-4 w-4" />
                              </div>

                              <div className="min-w-0">
                                <p className="font-semibold text-ink-900">
                                  {item.product_name}
                                </p>
                                <p className="mt-0.5 truncate text-xs text-ink-500">
                                  {[
                                    item.variation_name,
                                    item.sku,
                                  ]
                                    .filter(Boolean)
                                    .join(' · ') || 'No SKU'}
                                </p>
                              </div>
                            </div>
                          </Td>

                          <Td numeric>
                            <span className="font-medium">
                              {Number(item.quantity)}
                            </span>
                          </Td>

                          <Td numeric>
                            {money(item.unit_price)}
                          </Td>

                          <Td numeric className="font-semibold">
                            {money(item.line_total)}
                          </Td>

                          <Td numeric>
                            {item.total_cost === null
                              ? '—'
                              : money(item.total_cost)}
                          </Td>

                          <Td numeric>
                            {item.gross_profit === null ? (
                              '—'
                            ) : (
                              <span className="font-semibold text-success-700">
                                {money(item.gross_profit)}
                              </span>
                            )}
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TableWrap>
              </div>
            </SectionCard>

            <SectionCard title="Order activity" icon={Clock3}>
              {history.length === 0 ? (
                <p className="text-sm text-ink-500">
                  No activity recorded yet.
                </p>
              ) : (
                <div className="relative ml-2 space-y-5 border-l border-ink-200 pl-6">
                  {history.map((entry, index) => (
                    <div key={index} className="relative">
                      <span className="absolute -left-[31px] top-0.5 grid h-5 w-5 place-items-center rounded-full border-4 border-white bg-brand-500" />

                      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="text-sm font-semibold text-ink-900">
                            {entry.to_label}
                          </p>
                          {entry.note && (
                            <p className="mt-0.5 text-sm text-ink-500">
                              {entry.note}
                            </p>
                          )}
                        </div>

                        <p className="text-xs text-ink-400">
                          {entry.by ? `${entry.by} · ` : ''}
                          {dateTime(entry.at)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>

            {payments.length > 0 && (
              <SectionCard title="Payment history" icon={Banknote}>
                <div className="space-y-2">
                  {payments.map((payment) => (
                    <div
                      key={payment.id}
                      className="flex flex-wrap items-center gap-3 rounded-xl border border-ink-100 p-3"
                    >
                      <div className="grid h-9 w-9 place-items-center rounded-lg bg-success-50 text-success-700">
                        <Banknote className="h-4 w-4" />
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-ink-900">
                          {payment.number}
                        </p>
                        <p className="text-xs text-ink-500">
                          {payment.reference || 'No reference'}
                        </p>
                      </div>

                      <div className="text-right">
                        <p
                          className={
                            payment.is_refund
                              ? 'font-bold text-danger-700'
                              : 'font-bold text-success-700'
                          }
                        >
                          {money(payment.amount)}
                        </p>
                        <p className="text-xs text-ink-400">
                          {dateTime(payment.received_at)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </SectionCard>
            )}
          </div>

          {/* Right */}
          <aside className="space-y-5 xl:sticky xl:top-20">
            <SectionCard title="Customer" icon={UserRound}>
              <div className="flex items-center gap-3">
                <div className="grid h-11 w-11 place-items-center rounded-full bg-brand-50 text-brand-800">
                  <UserRound className="h-5 w-5" />
                </div>

                <div className="min-w-0">
                  <p className="truncate font-semibold text-ink-900">
                    {customerName}
                  </p>
                  <p className="text-xs text-ink-500">
                    Customer
                  </p>
                </div>
              </div>

              <div className="mt-4 space-y-2">
                <div className="flex items-start gap-2.5 rounded-lg bg-ink-50 p-3">
                  <Phone className="mt-0.5 h-4 w-4 shrink-0 text-ink-400" />
                  <span className="tabular text-sm text-ink-700">
                    {customerPhone}
                  </span>
                </div>

                <div className="flex items-start gap-2.5 rounded-lg bg-ink-50 p-3">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-ink-400" />
                  <span className="text-sm leading-5 text-ink-700">
                    {address || 'No shipping address'}
                  </span>
                </div>
              </div>

              {order.customer_note && (
                <div className="mt-3 rounded-xl border border-warning-100 bg-warning-50 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-warning-700">
                    Customer note
                  </p>
                  <p className="mt-1 text-sm leading-5 text-warning-900">
                    {order.customer_note}
                  </p>
                </div>
              )}
            </SectionCard>

            <SectionCard title="Order summary" icon={ShoppingBag}>
              <dl className="space-y-2.5 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-ink-500">Subtotal</dt>
                  <dd className="tabular font-medium text-ink-900">
                    {money(order.subtotal)}
                  </dd>
                </div>

                {Number(order.discount_total) > 0 && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-ink-500">Discount</dt>
                    <dd className="tabular font-medium text-success-700">
                      − {money(order.discount_total)}
                    </dd>
                  </div>
                )}

                <div className="flex justify-between gap-4">
                  <dt className="text-ink-500">Delivery</dt>
                  <dd className="tabular font-medium text-ink-900">
                    {money(order.shipping_charge)}
                  </dd>
                </div>

                <div className="border-t border-ink-100 pt-3">
                  <div className="flex justify-between gap-4">
                    <dt className="font-bold text-ink-900">Total</dt>
                    <dd className="tabular text-lg font-bold text-brand-800">
                      {money(order.total)}
                    </dd>
                  </div>
                </div>

                <div className="flex justify-between gap-4">
                  <dt className="text-ink-500">Paid</dt>
                  <dd className="tabular font-medium text-success-700">
                    {money(order.paid_total)}
                  </dd>
                </div>

                <div className="flex justify-between gap-4">
                  <dt className="text-ink-500">Due</dt>
                  <dd className="tabular font-semibold text-warning-700">
                    {money(order.due_total)}
                  </dd>
                </div>

                {order.gross_profit !== null && (
                  <div className="flex justify-between gap-4 border-t border-ink-100 pt-3">
                    <dt className="font-semibold text-ink-700">
                      Gross profit
                    </dt>
                    <dd className="tabular font-bold text-success-700">
                      {money(order.gross_profit)}
                    </dd>
                  </div>
                )}
              </dl>
            </SectionCard>

            <SectionCard title="Delivery" icon={Truck}>
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <div className="grid h-9 w-9 place-items-center rounded-lg bg-brand-50 text-brand-800">
                    <Truck className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-xs text-ink-400">Method</p>
                    <p className="mt-0.5 text-sm font-semibold text-ink-900">
                      {order.shipping?.method || '—'}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-lg bg-ink-50 p-3">
                    <p className="text-[10px] uppercase tracking-wider text-ink-400">
                      Zone
                    </p>
                    <p className="mt-1 text-xs font-semibold text-ink-800">
                      {order.shipping?.zone || '—'}
                    </p>
                  </div>

                  <div className="rounded-lg bg-ink-50 p-3">
                    <p className="text-[10px] uppercase tracking-wider text-ink-400">
                      Payment
                    </p>
                    <p className="mt-1 text-xs font-semibold text-ink-800">
                      {order.payment_method || '—'}
                    </p>
                  </div>
                </div>
              </div>
            </SectionCard>

            <RecordPayment order={order} onDone={refresh} />
          </aside>
        </div>
      </div>
    </div>
    </>
  )
}