import { Link, useParams, useSearchParams } from 'react-router-dom'
import { CheckCircle2, ChevronRight, ImageOff, Truck } from 'lucide-react'
import { dateTime, money } from '../../lib/format'
import { Badge, ErrorState, Spinner } from '../../components/ui'
import { TrustBadges } from '../../components/TrustBadges'
import { statusTone } from './orderStatus'
import { PhoneGate } from './PhoneGate'
import { useOrder } from './useCheckout'

/**
 * The receipt shown the moment an order is placed.
 *
 * Deliberately a different page from /orders/:number rather than the same
 * one with a banner bolted on. That page is for checking on an order days or
 * weeks later -- cancelling it, watching it ship -- and "your order is
 * placed!" stops being true the moment it does either of those things. This
 * one is a single honest moment: here is what you just bought, here is the
 * receipt, here is where to track it from now on.
 */
export function OrderCompletePage() {
  const { number } = useParams()
  const [params, setParams] = useSearchParams()

  const phone = params.get('phone') ?? ''
  const order = useOrder(number, phone)

  if (order.isLoading) {
    return (
      <div className="grid place-items-center py-24">
        <Spinner />
      </div>
    )
  }

  if (order.isError && [403, 404].includes(order.error?.status)) {
    return (
      <PhoneGate
        number={number}
        error={phone ? 'That number does not match this order.' : null}
        onSubmit={(value) => setParams({ phone: value }, { replace: true })}
      />
    )
  }

  if (order.isError) return <ErrorState error={order.error} onRetry={order.refetch} />

  const data = order.data
  const items = data.items ?? []
  const couponDiscount = Number(data.coupon_discount ?? 0)

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 print:max-w-full">
      <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-sm text-ink-500 print:hidden">
        <Link to="/" className="hover:text-ink-900">
          Home
        </Link>
        <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
        <span className="text-ink-900">Order confirmed</span>
      </nav>

      <div className="flex flex-col items-center gap-2 py-4 text-center">
        <span className="grid h-14 w-14 place-items-center rounded-full bg-success-50 text-success-700">
          <CheckCircle2 className="h-7 w-7" aria-hidden="true" />
        </span>
        <h1 className="text-xl font-semibold text-ink-900">Thank you — your order is placed.</h1>
        <p className="max-w-md text-sm text-ink-600">
          We will call you on {data.shipping.phone} to confirm before sending it out.
          {data.payment_method?.is_cod && ' Pay the courier when it arrives.'}
        </p>
      </div>

      <div className="grid gap-3 rounded-card border border-brand-100 bg-brand-50 p-4 text-center sm:grid-cols-3 sm:items-center">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-brand-800">Order ID</p>
          <p className="mt-0.5 font-semibold text-ink-900">{data.number}</p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-brand-800">Payment method</p>
          <p className="mt-0.5 font-medium text-ink-900">{data.payment_method?.name ?? '—'}</p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-brand-800">Status</p>
          <div className="mt-0.5 flex items-center justify-center gap-1.5">
            <Badge tone={statusTone(data.status)}>{data.status_label}</Badge>
            <Badge tone={data.payment_status === 'paid' ? 'success' : 'neutral'}>
              {data.payment_status_label}
            </Badge>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-card border border-ink-200 bg-white">
        <div className="hidden grid-cols-[1fr_6rem_6rem] gap-4 bg-brand-600 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-white sm:grid">
          <span>Product</span>
          <span>Quantity</span>
          <span className="text-right">Subtotal</span>
        </div>

        <ul className="divide-y divide-ink-100">
          {items.map((item) => (
            <li
              key={item.id}
              className="grid grid-cols-[3rem_1fr_auto] items-center gap-3 p-3 sm:grid-cols-[3rem_1fr_6rem_6rem] sm:gap-4 sm:p-4"
            >
              <span className="block h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-ink-100">
                {item.image ? (
                  <img src={item.image} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="grid h-full place-items-center text-ink-300">
                    <ImageOff className="h-5 w-5" aria-hidden="true" />
                  </span>
                )}
              </span>

              <div className="min-w-0">
                <p className="line-clamp-2 text-sm font-medium text-ink-900">{item.product_name}</p>
                <p className="text-xs text-ink-500">
                  {[item.variation_name, item.sku].filter(Boolean).join(' · ')}
                </p>
                <p className="tabular mt-0.5 text-xs text-ink-500 sm:hidden">
                  {Number(item.quantity)} × {money(item.unit_price)}
                </p>
              </div>

              <span className="tabular hidden text-sm text-ink-700 sm:block">{Number(item.quantity)}</span>

              <span className="tabular col-start-3 row-start-1 text-right text-sm font-semibold text-ink-900 sm:col-start-4 sm:row-start-1">
                {money(item.line_total)}
              </span>
            </li>
          ))}
        </ul>

        <dl className="flex flex-col gap-2 border-t border-ink-200 p-4 text-sm">
          <div className="flex justify-between">
            <dt className="text-ink-600">Subtotal</dt>
            <dd className="tabular text-ink-900">{money(data.subtotal)}</dd>
          </div>

          {Number(data.discount_total) > 0 && (
            <div className="flex justify-between">
              <dt className="text-ink-600">Discount</dt>
              <dd className="tabular text-accent-600">− {money(data.discount_total)}</dd>
            </div>
          )}

          {couponDiscount > 0 && (
            <div className="flex justify-between">
              <dt className="text-ink-600">Coupon {data.coupon_code && `(${data.coupon_code})`}</dt>
              <dd className="tabular text-accent-600">− {money(couponDiscount)}</dd>
            </div>
          )}

          <div className="flex justify-between">
            <dt className="text-ink-600">Delivery {data.shipping.method && `(${data.shipping.method})`}</dt>
            <dd className="tabular text-ink-900">{money(data.shipping_charge)}</dd>
          </div>

          <div className="flex justify-between border-t border-ink-100 pt-2 text-base font-semibold">
            <dt className="text-ink-900">Total</dt>
            <dd className="tabular text-brand-800">{money(data.total)}</dd>
          </div>

          {Number(data.due_total) > 0 && (
            <div className="flex justify-between text-sm">
              <dt className="text-ink-600">Still to pay</dt>
              <dd className="tabular font-semibold text-ink-900">{money(data.due_total)}</dd>
            </div>
          )}
        </dl>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 print:hidden">
        <div className="rounded-card border border-ink-200 bg-white p-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-ink-900">
            <Truck className="h-4 w-4 text-brand-800" aria-hidden="true" />
            Delivering to
          </h2>
          <p className="mt-2 text-sm text-ink-800">{data.shipping.name}</p>
          <p className="mt-1 text-sm text-ink-600">
            {[
              data.shipping.address_line1,
              data.shipping.address_line2,
              data.shipping.area,
              data.shipping.city,
              data.shipping.district,
            ]
              .filter(Boolean)
              .join(', ')}
          </p>
          {data.shipping.estimate && (
            <p className="mt-1 text-xs text-ink-500">Estimated delivery: {data.shipping.estimate}</p>
          )}
        </div>

        <div className="rounded-card border border-ink-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-ink-900">Placed</h2>
          <p className="mt-2 text-sm text-ink-800">{dateTime(data.placed_at)}</p>

          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              to={`/orders/${data.number}${phone ? `?phone=${encodeURIComponent(phone)}` : ''}`}
              className="rounded-lg border border-ink-200 bg-white px-3 py-1.5 text-sm font-medium text-ink-700 hover:border-ink-300"
            >
              Track this order
            </Link>
            <Link
              to="/products"
              className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700"
            >
              Continue shopping
            </Link>
          </div>
        </div>
      </div>

      <div className="print:hidden">
        <TrustBadges />
      </div>
    </div>
  )
}
