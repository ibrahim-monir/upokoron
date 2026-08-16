import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowRight,
  CreditCard,
  Headset,
  ImageOff,
  Minus,
  Plus,
  ShoppingBag,
  Tag,
  Trash2,
  Truck,
  X,
} from 'lucide-react'
import { cx, money } from '../../lib/format'
import { Button, EmptyState, ErrorState, Input, Spinner, useToast } from '../../components/ui'
import { DistrictSelect } from '../../components/DistrictSelect'
import {
  useApplyCoupon,
  useCart,
  useClearCart,
  useRemoveCartItem,
  useRemoveCoupon,
  useShippingQuote,
  useUpdateCartItem,
} from './useCart'

/**
 * Quantity stepper.
 *
 * Every change goes to the server, because the server is what holds the
 * stock. There is no optimistic update here on purpose: raising the quantity
 * can fail on stock, and showing "3" for a moment before snapping back to 2
 * teaches shoppers not to trust the number.
 */
function QuantityStepper({ value, onChange, disabled }) {
  const quantity = Number(value)

  return (
    <div className="inline-flex items-center rounded-lg border border-ink-200">
      <button
        type="button"
        onClick={() => onChange(quantity - 1)}
        disabled={disabled || quantity <= 1}
        aria-label="Reduce quantity"
        className="grid h-9 w-9 place-items-center rounded-l-lg text-ink-600 transition-colors enabled:hover:bg-ink-50 disabled:opacity-40"
      >
        <Minus className="h-4 w-4" aria-hidden="true" />
      </button>

      <span className="tabular w-10 text-center text-sm font-semibold text-ink-900">
        {quantity % 1 === 0 ? quantity : quantity.toFixed(3)}
      </span>

      <button
        type="button"
        onClick={() => onChange(quantity + 1)}
        disabled={disabled}
        aria-label="Increase quantity"
        className="grid h-9 w-9 place-items-center rounded-r-lg text-ink-600 transition-colors enabled:hover:bg-ink-50 disabled:opacity-40"
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  )
}

/**
 * One row of the cart table: a remove control, the product, its unit price,
 * a quantity stepper, and the line's subtotal -- laid out as real columns on
 * a wide screen and stacked back down on a phone, rather than two different
 * markups pretending to be the same component.
 */
function CartRow({ line, busy, onQuantity, onRemove }) {
  return (
    <div className="grid grid-cols-[auto_1fr_auto] items-start gap-3 p-3 sm:grid-cols-[auto_1fr_6rem_9rem_6rem] sm:items-center sm:gap-4 sm:p-4">
      <button
        type="button"
        onClick={() => onRemove(line.id)}
        disabled={busy}
        aria-label={`Remove ${line.name}`}
        className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-ink-400 transition-colors hover:bg-danger-50 hover:text-danger-700 disabled:opacity-50"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>

      <div className="flex min-w-0 items-center gap-3">
        <Link
          to={`/products/${line.slug}`}
          className="block h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-ink-100 sm:h-20 sm:w-20"
        >
          {line.image ? (
            <img src={line.image} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="grid h-full place-items-center text-ink-300">
              <ImageOff className="h-6 w-6" aria-hidden="true" />
            </span>
          )}
        </Link>

        <div className="min-w-0">
          <Link
            to={`/products/${line.slug}`}
            className="line-clamp-2 text-sm font-medium text-ink-900 hover:text-brand-600"
          >
            {line.name}
          </Link>

          {line.variation && <p className="mt-0.5 text-xs text-ink-500">{line.variation}</p>}

          {/* Prices under the name on mobile, where the Price column is hidden. */}
          <div className="mt-1 flex items-baseline gap-2 sm:hidden">
            <span className="tabular text-sm font-semibold text-brand-700">{money(line.unit_price)}</span>
            {Number(line.line_discount) > 0 && (
              <span className="tabular text-xs text-ink-400 line-through">{money(line.list_price)}</span>
            )}
          </div>

          {/*
            A lapsed hold does not empty the basket -- the shopper keeps
            seeing what they picked. But it has to be said plainly, because
            the stock is no longer theirs and checkout will refuse the line.
          */}
          {!line.is_held && (
            <p className="mt-1 flex items-start gap-1.5 text-xs font-medium text-warning-700">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>
                No longer reserved for you
                {Number(line.available) > 0
                  ? ` — ${Number(line.available)} left in stock`
                  : ' — out of stock'}
              </span>
            </p>
          )}
        </div>
      </div>

      <div className="tabular hidden text-sm font-medium text-ink-700 sm:block">
        {money(line.unit_price)}
        {Number(line.line_discount) > 0 && (
          <span className="ml-1.5 text-xs text-ink-400 line-through">{money(line.list_price)}</span>
        )}
      </div>

      <div className="col-start-2 row-start-2 sm:col-start-4 sm:row-start-1">
        <QuantityStepper
          value={line.quantity}
          disabled={busy}
          onChange={(next) => onQuantity(line.id, next)}
        />
      </div>

      <div className="tabular col-start-3 row-start-1 self-start text-right text-sm font-semibold text-ink-900 sm:col-start-5 sm:row-start-1 sm:self-center">
        {money(line.line_total)}
      </div>
    </div>
  )
}

/** Three short reasons to keep going, the way a checkout page earns trust. */
function TrustBadges() {
  const items = [
    { icon: Truck, title: 'Fast delivery', body: 'Delivered across Bangladesh' },
    { icon: CreditCard, title: 'Flexible payment', body: 'Cash on delivery, bKash, Nagad & bank' },
    { icon: Headset, title: 'Real support', body: "We're a call or message away" },
  ]

  return (
    <div className="grid gap-4 rounded-card border border-ink-200 bg-white p-4 sm:grid-cols-3 sm:p-6">
      {items.map(({ icon: Icon, title, body }) => (
        <div key={title} className="flex items-center gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-600">
            <Icon className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <p className="text-sm font-semibold text-ink-900">{title}</p>
            <p className="text-xs text-ink-500">{body}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

/** A code typed once, applied to the whole cart, and removable with one click. */
function CouponBox({ coupon }) {
  const toast = useToast()
  const [code, setCode] = useState('')

  const apply = useApplyCoupon()
  const remove = useRemoveCoupon()

  if (coupon) {
    return (
      <div
        className={cx(
          'flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm',
          coupon.is_valid
            ? 'border-accent-500/40 bg-accent-50 text-accent-700'
            : 'border-warning-500/40 bg-warning-50 text-warning-700',
        )}
      >
        <span className="flex items-center gap-1.5 font-medium">
          <Tag className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {coupon.is_valid ? (
            <>
              “{coupon.code}” applied — you save {money(coupon.discount)}
            </>
          ) : (
            <>
              “{coupon.code}”: {coupon.message ?? 'no longer applies'}
            </>
          )}
        </span>
        <button
          type="button"
          onClick={() => remove.mutate()}
          disabled={remove.isPending}
          className="font-medium underline underline-offset-2 disabled:opacity-50"
        >
          Remove
        </button>
      </div>
    )
  }

  return (
    <form
      className="flex gap-2"
      onSubmit={(event) => {
        event.preventDefault()

        if (!code.trim()) return

        apply.mutate(code.trim(), {
          onSuccess: () => setCode(''),
          onError: (error) => toast.error(error?.message ?? 'That coupon could not be applied.'),
        })
      }}
    >
      <Input
        value={code}
        onChange={(event) => setCode(event.target.value)}
        placeholder="Coupon code"
        aria-label="Coupon code"
        className="min-w-0 flex-1"
      />
      <Button type="submit" variant="secondary" loading={apply.isPending} disabled={!code.trim()}>
        Apply coupon
      </Button>
    </form>
  )
}

export function CartPage() {
  const toast = useToast()
  const cart = useCart()
  const quote = useShippingQuote()

  const [district, setDistrict] = useState('')
  const [city, setCity] = useState('')

  const updateItem = useUpdateCartItem()
  const removeItem = useRemoveCartItem()
  const clearCart = useClearCart()

  const busy = updateItem.isPending || removeItem.isPending || clearCart.isPending

  const handle = (mutation, variables) =>
    mutation.mutate(variables, {
      onError: (error) => toast.error(error?.message ?? 'That did not work.'),
    })

  if (cart.isLoading) {
    return (
      <div className="grid place-items-center py-24">
        <Spinner />
      </div>
    )
  }

  if (cart.isError) {
    return <ErrorState error={cart.error} onRetry={cart.refetch} />
  }

  const data = cart.data
  const lines = data?.items ?? []

  if (lines.length === 0) {
    return (
      <div className="rounded-card border border-ink-200 bg-white">
        <EmptyState
          icon={ShoppingBag}
          title="Your cart is empty"
          description="Nothing here yet. Browse the shop and add something you like."
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

  const option = quote.data?.options?.[0]
  const subtotal = Number(data.subtotal)
  const discount = Number(data.discount)
  const coupon = data.coupon
  const couponDiscount = coupon?.is_valid ? Number(coupon.discount) : 0
  const delivery = option ? Number(option.charge) : null
  // `subtotal` is already net of item-level discounts (that is what "You
  // save" reports against list price), so only the coupon and delivery
  // adjust it further here.
  const total = subtotal - couponDiscount + (delivery ?? 0)

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-ink-900">
        Your cart <span className="text-ink-400">({lines.length})</span>
      </h1>

      {data.has_unheld_items && (
        <div className="flex items-start gap-2 rounded-card border border-warning-500/40 bg-warning-50 p-3 text-sm text-warning-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p>
            Some items are no longer reserved for you. Carts hold stock for a limited time so it
            does not sit unavailable for everyone else. Adjust the quantity to take them again.
          </p>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <div className="flex flex-col gap-3">
          <div className="overflow-hidden rounded-card border border-ink-200 bg-white">
            {/* Column headers, shown once the row layout has room for them. */}
            <div className="hidden grid-cols-[auto_1fr_6rem_9rem_6rem] gap-4 bg-brand-600 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-white sm:grid">
              <span aria-hidden="true" />
              <span>Product</span>
              <span>Price</span>
              <span>Quantity</span>
              <span className="text-right">Subtotal</span>
            </div>

            <div className="divide-y divide-ink-100">
              {lines.map((line) => (
                <CartRow
                  key={line.id}
                  line={line}
                  busy={busy}
                  onQuantity={(itemId, quantity) => handle(updateItem, { itemId, quantity })}
                  onRemove={(itemId) => handle(removeItem, itemId)}
                />
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 px-1">
            <div className="w-full sm:w-auto sm:min-w-72">
              <CouponBox coupon={coupon} />
            </div>

            <button
              type="button"
              onClick={() => {
                if (window.confirm('Remove everything from your cart?')) handle(clearCart)
              }}
              disabled={busy}
              className="inline-flex shrink-0 items-center gap-1.5 text-sm font-medium text-ink-500 hover:text-danger-700 disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              Clear shopping cart
            </button>
          </div>

          <TrustBadges />
        </div>

        <div className="flex flex-col gap-4 lg:sticky lg:top-20 lg:self-start">
          <div className="rounded-card border border-ink-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-ink-900">Order summary</h2>

            <dl className="mt-3 flex flex-col gap-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-ink-600">Items</dt>
                <dd className="tabular font-medium text-ink-900">{data.item_count}</dd>
              </div>

              <div className="flex justify-between">
                <dt className="text-ink-600">Subtotal</dt>
                <dd className="tabular font-medium text-ink-900">{money(subtotal)}</dd>
              </div>

              {discount > 0 && (
                <div className="flex justify-between">
                  <dt className="text-ink-600">You save</dt>
                  <dd className="tabular font-medium text-accent-600">− {money(discount)}</dd>
                </div>
              )}

              {couponDiscount > 0 && (
                <div className="flex justify-between">
                  <dt className="text-ink-600">Coupon ({coupon.code})</dt>
                  <dd className="tabular font-medium text-accent-600">− {money(couponDiscount)}</dd>
                </div>
              )}

              <div className="flex justify-between border-t border-ink-100 pt-2">
                <dt className="text-ink-600">Delivery</dt>
                <dd className="tabular text-ink-900">
                  {option ? (option.is_free ? 'Free' : money(delivery)) : <span className="text-ink-500">Enter a district</span>}
                </dd>
              </div>

              <div className="flex justify-between border-t border-ink-100 pt-2 text-base font-semibold">
                <dt className="text-ink-900">Total</dt>
                <dd className="tabular text-brand-700">{money(total)}</dd>
              </div>
            </dl>

            {/*
              Disabled while any hold has lapsed: checkout would refuse the
              order anyway, and being told here -- next to the line that is
              the problem -- is better than being told after filling in an
              address.
            */}
            <Link
              to="/checkout"
              aria-disabled={data.has_unheld_items}
              onClick={(event) => {
                if (data.has_unheld_items) event.preventDefault()
              }}
              className={cx(
                'mt-4 flex h-10 w-full items-center justify-center gap-2 rounded-lg text-sm font-medium transition-colors',
                data.has_unheld_items
                  ? 'pointer-events-none bg-ink-200 text-ink-500'
                  : 'bg-brand-600 text-white shadow-card hover:bg-brand-700',
              )}
            >
              Proceed to checkout
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>

            <p className="mt-2 text-center text-xs text-ink-500">Cash on delivery available.</p>
          </div>

          {/*
            Delivery estimate, on the cart page rather than saved for
            checkout -- "how much is delivery?" is the question that decides
            whether people carry on at all. The charge is quoted by the
            server from its own copy of the basket, and feeds the Delivery
            and Total rows above the moment it comes back.
          */}
          <div className="rounded-card border border-ink-200 bg-white p-4">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-ink-900">
              <Truck className="h-4 w-4 text-brand-600" aria-hidden="true" />
              Delivery charge
            </h2>

            <form
              className="mt-3 grid gap-2"
              onSubmit={(event) => {
                event.preventDefault()

                if (district.trim()) quote.mutate({ district: district.trim(), city: city.trim() })
              }}
            >
              <DistrictSelect
                value={district}
                onChange={(event) => setDistrict(event.target.value)}
                aria-label="District"
                className="w-full min-w-0"
              />
              <input
                value={city}
                onChange={(event) => setCity(event.target.value)}
                placeholder="City (optional)"
                aria-label="City"
                className="h-10 w-full min-w-0 rounded-lg border border-ink-200 px-3 text-sm text-ink-900 placeholder:text-ink-400"
              />
              <Button type="submit" variant="secondary" className="w-full" loading={quote.isPending} disabled={!district.trim()}>
                Check delivery charge
              </Button>
            </form>

            {quote.isError && (
              <p className="mt-2 text-sm text-danger-700">{quote.error?.message ?? 'Could not get a quote.'}</p>
            )}

            {option && (
              <div className="mt-3 rounded-lg bg-ink-50 p-3 text-sm">
                <p className="font-medium text-ink-900">{quote.data.zone.name}</p>
                <p className="mt-0.5 text-ink-600">
                  {option.name}
                  {option.estimate ? ` · ${option.estimate}` : ''}
                </p>
                <p className="mt-1 font-semibold text-brand-700">
                  {option.is_free ? 'Free delivery' : money(option.charge)}
                </p>
                {!option.is_free && option.free_above_subtotal && (
                  <p className="mt-1 text-xs text-ink-500">
                    Free above {money(option.free_above_subtotal)} — add{' '}
                    {money(Number(option.free_above_subtotal) - subtotal)} more.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
