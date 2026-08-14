import { useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { CheckCircle2, Package, Phone, Truck } from 'lucide-react'
import { dateTime, money } from '../../lib/format'
import { Badge, Button, ErrorState, Spinner, useToast } from '../../components/ui'
import { statusTone } from './orderStatus'
import { useCancelOrder, useOrder } from './useCheckout'

/**
 * Asked for when someone opens an order link without a session and without
 * the phone number in the URL -- a bookmarked confirmation, or a link
 * forwarded to a family member.
 */
function PhoneGate({ number, onSubmit, error }) {
  const [phone, setPhone] = useState('')

  return (
    <div className="mx-auto max-w-md rounded-card border border-ink-200 bg-white p-5">
      <h1 className="text-lg font-semibold text-ink-900">Find order {number}</h1>
      <p className="mt-1 text-sm text-ink-600">
        Enter the mobile number the order was placed with, or{' '}
        <Link to="/login" className="font-medium text-brand-600 hover:underline">
          sign in
        </Link>
        .
      </p>

      <form
        className="mt-4 flex flex-col gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          onSubmit(phone.trim())
        }}
      >
        <input
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          placeholder="01XXXXXXXXX"
          inputMode="tel"
          aria-label="Mobile number"
          className="h-10 rounded-lg border border-ink-200 px-3 text-sm text-ink-900 placeholder:text-ink-400"
        />
        <Button type="submit" disabled={!phone.trim()}>
          Show my order
        </Button>
      </form>

      {error && <p className="mt-3 text-sm text-danger-700">{error}</p>}
    </div>
  )
}

export function OrderDetailPage() {
  const { number } = useParams()
  const [params, setParams] = useSearchParams()
  const toast = useToast()

  const phone = params.get('phone') ?? ''
  const order = useOrder(number, phone)
  const cancel = useCancelOrder()

  // Set only by the redirect straight after checkout, so a returning
  // customer opening an old order is not congratulated again.
  const justPlaced = params.get('placed') === '1'

  if (order.isLoading) {
    return (
      <div className="grid place-items-center py-24">
        <Spinner />
      </div>
    )
  }

  /*
   * 403 means "prove it is yours", 404 means "that number and phone do not
   * go together". Both are answered with the same form rather than an error
   * page: the person is almost always the buyer, looking at a link they were
   * sent, and a dead end helps nobody.
   */
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

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      {justPlaced && (
        <div className="flex items-start gap-3 rounded-card border border-success-500/40 bg-success-50 p-4">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success-700" aria-hidden="true" />
          <div>
            <p className="font-semibold text-success-700">Thank you — your order is placed.</p>
            <p className="mt-1 text-sm text-ink-700">
              We will call you on {data.shipping.phone} to confirm before sending it out.
              {data.payment_method?.is_cod && ' Pay the courier when it arrives.'}
            </p>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink-900">Order {data.number}</h1>
          <p className="mt-0.5 text-sm text-ink-500">Placed {dateTime(data.placed_at)}</p>
        </div>

        <div className="flex items-center gap-2">
          <Badge tone={statusTone(data.status)}>{data.status_label}</Badge>
          <Badge tone={data.payment_status === 'paid' ? 'success' : 'neutral'}>
            {data.payment_status_label}
          </Badge>
        </div>
      </div>

      <div className="rounded-card border border-ink-200 bg-white">
        <ul className="divide-y divide-ink-100">
          {(data.items ?? []).map((item) => (
            <li key={item.id} className="flex items-baseline justify-between gap-3 p-3 text-sm">
              <div className="min-w-0">
                <p className="font-medium text-ink-900">{item.product_name}</p>
                <p className="text-xs text-ink-500">
                  {[item.variation_name, item.sku].filter(Boolean).join(' · ')}
                </p>
              </div>
              <span className="tabular shrink-0 text-ink-600">
                {Number(item.quantity)} × {money(item.unit_price)}
              </span>
              <span className="tabular shrink-0 font-semibold text-ink-900">{money(item.line_total)}</span>
            </li>
          ))}
        </ul>

        <dl className="flex flex-col gap-2 border-t border-ink-200 p-3 text-sm">
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

          <div className="flex justify-between">
            <dt className="text-ink-600">Delivery {data.shipping.method && `(${data.shipping.method})`}</dt>
            <dd className="tabular text-ink-900">{money(data.shipping_charge)}</dd>
          </div>

          <div className="flex justify-between border-t border-ink-100 pt-2 text-base font-semibold">
            <dt className="text-ink-900">Total</dt>
            <dd className="tabular text-brand-700">{money(data.total)}</dd>
          </div>

          {Number(data.due_total) > 0 && (
            <div className="flex justify-between text-sm">
              <dt className="text-ink-600">Still to pay</dt>
              <dd className="tabular font-semibold text-ink-900">{money(data.due_total)}</dd>
            </div>
          )}
        </dl>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-card border border-ink-200 bg-white p-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-ink-900">
            <Truck className="h-4 w-4 text-brand-600" aria-hidden="true" />
            Delivering to
          </h2>
          <p className="mt-2 text-sm text-ink-800">{data.shipping.name}</p>
          <p className="flex items-center gap-1.5 text-sm text-ink-600">
            <Phone className="h-3.5 w-3.5" aria-hidden="true" />
            {data.shipping.phone}
          </p>
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
        </div>

        <div className="rounded-card border border-ink-200 bg-white p-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-ink-900">
            <Package className="h-4 w-4 text-brand-600" aria-hidden="true" />
            Progress
          </h2>

          <ol className="mt-2 flex flex-col gap-2">
            {(data.history ?? []).map((entry, index) => (
              <li key={index} className="flex items-baseline gap-2 text-sm">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" aria-hidden="true" />
                <span className="text-ink-800">{entry.status_label}</span>
                <span className="ml-auto shrink-0 text-xs text-ink-500">{dateTime(entry.at)}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Link
          to="/orders"
          className="rounded-lg border border-ink-200 bg-white px-4 py-2 text-sm font-medium text-ink-700 hover:border-ink-300"
        >
          All my orders
        </Link>

        {data.can_cancel && (
          <Button
            variant="secondary"
            loading={cancel.isPending}
            onClick={() => {
              const reason = window.prompt('Why are you cancelling? (optional)')

              // prompt returns null on Cancel, '' if they pressed OK with an
              // empty box -- only the first means "changed my mind".
              if (reason === null) return

              cancel.mutate(
                { number: data.number, reason, phone },
                {
                  onSuccess: () => toast.success('Order cancelled.'),
                  onError: (error) => toast.error(error?.message ?? 'Could not cancel that.'),
                },
              )
            }}
          >
            Cancel order
          </Button>
        )}
      </div>
    </div>
  )
}
