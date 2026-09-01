import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowRight,
  Gift,
  ImageOff,
  Minus,
  Plus,
  ShoppingBag,
  Tag,
  Trash2,
  X,
} from 'lucide-react'
import { cx, money } from '../../lib/format'
import { Button, EmptyState, ErrorState, Input, Spinner, useToast } from '../../components/ui'
import { TrustBadges } from '../../components/TrustBadges'
import { useAuthStore } from '../../stores/authStore'
import {
  useApplyCoupon,
  useCart,
  useClearCart,
  useRedeemRewardPoints,
  useRemoveCartItem,
  useRemoveCoupon,
  useRemoveRewardPoints,
  useRewardBalanceByPhone,
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
            className="line-clamp-2 text-sm font-medium text-ink-900 hover:text-brand-800"
          >
            {line.name}
          </Link>

          {line.variation && <p className="mt-0.5 text-xs text-ink-500">{line.variation}</p>}
          {line.sku && <p className="mt-0.5 text-xs text-ink-400">SKU: {line.sku}</p>}

          {/* Prices under the name on mobile, where the Price column is hidden. */}
          <div className="mt-1 flex items-baseline gap-2 sm:hidden">
            <span className="tabular text-sm font-semibold text-brand-800">{money(line.unit_price)}</span>
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

/** A code typed once, applied to the whole cart, and removable with one click. */
function CouponBox({ coupon }) {
  const toast = useToast()
  const [code, setCode] = useState('')

  const apply = useApplyCoupon()
  const remove = useRemoveCoupon()

  return (
    <div className="rounded-lg border border-ink-200 p-3">
      <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-500">
        <Tag className="h-3.5 w-3.5" aria-hidden="true" />
        Coupon code
      </p>

      {coupon ? (
        <div
          className={cx(
            'flex flex-wrap items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm',
            coupon.is_valid ? 'bg-accent-50 text-accent-700' : 'bg-warning-50 text-warning-700',
          )}
        >
          <span className="font-medium">
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
      ) : (
        <form
          className="grid gap-2"
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
            onChange={(event) => setCode(event.target.value.toUpperCase())}
            placeholder="Enter code"
            aria-label="Coupon code"
            className="w-full uppercase placeholder:normal-case"
          />
          <Button type="submit" variant="soft" className="w-full" loading={apply.isPending} disabled={!code.trim()}>
            Apply coupon
          </Button>
        </form>
      )}
    </div>
  )
}

/**
 * Spend loyalty points for a discount, the same one-code-in-one-click-out
 * shape as the coupon box above it.
 *
 * Signed out, there is no cart-linked balance to spend, so this shows a
 * phone-number balance lookup instead -- no login, no code sent to prove
 * the number is theirs, just a number to answer "is logging in worth it".
 * Redeeming still requires an account; the server enforces that too.
 */
function RewardPointsBox({ rewardPoints, balance }) {
  const toast = useToast()
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const [points, setPoints] = useState('')
  const [phone, setPhone] = useState('')

  const redeem = useRedeemRewardPoints()
  const remove = useRemoveRewardPoints()
  const check = useRewardBalanceByPhone()

  return (
    <div className="rounded-lg border border-ink-200 p-3">
      <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-500">
        <Gift className="h-3.5 w-3.5" aria-hidden="true" />
        Reward points
      </p>

      {!isAuthenticated ? (
        <div className="flex flex-col gap-2">
          <form
            className="grid gap-2"
            onSubmit={(event) => {
              event.preventDefault()

              if (!phone.trim()) return

              check.mutate(phone.trim(), {
                onError: (error) => toast.error(error?.message ?? 'Could not check that number.'),
              })
            }}
          >
            <Input
              type="tel"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="Your phone number"
              aria-label="Phone number"
              className="w-full"
            />
            <Button type="submit" variant="soft" className="w-full" loading={check.isPending} disabled={!phone.trim()}>
              Check balance
            </Button>
          </form>

          {check.isSuccess && (
            <div
              className={cx(
                'rounded-lg px-3 py-2 text-sm',
                check.data.balance > 0 ? 'bg-accent-50 text-accent-700' : 'bg-ink-50 text-ink-600',
              )}
            >
              {check.data.balance > 0 ? (
                <>
                  <span className="font-semibold">{check.data.balance} points</span> on this number.{' '}
                  <Link to="/login" className="font-medium underline underline-offset-2">
                    Log in
                  </Link>{' '}
                  to redeem them.
                </>
              ) : (
                'No reward points found for this number.'
              )}
            </div>
          )}
        </div>
      ) : rewardPoints ? (
        <div
          className={cx(
            'flex flex-wrap items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm',
            rewardPoints.is_valid ? 'bg-accent-50 text-accent-700' : 'bg-warning-50 text-warning-700',
          )}
        >
          <span className="font-medium">
            {rewardPoints.is_valid ? (
              <>
                {rewardPoints.points} points applied — you save {money(rewardPoints.discount)}
              </>
            ) : (
              <>{rewardPoints.points} points: {rewardPoints.message ?? 'no longer applies'}</>
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
      ) : balance > 0 ? (
        <form
          className="grid gap-2"
          onSubmit={(event) => {
            event.preventDefault()

            const requested = parseInt(points, 10)
            if (!requested || requested <= 0) return

            redeem.mutate(requested, {
              onSuccess: () => setPoints(''),
              onError: (error) => toast.error(error?.message ?? 'Those points could not be redeemed.'),
            })
          }}
        >
          <p className="text-sm text-ink-600">
            You have <span className="font-semibold text-ink-900">{balance} points</span> available.
          </p>
          <Input
            type="number"
            min="1"
            max={balance}
            value={points}
            onChange={(event) => setPoints(event.target.value)}
            placeholder="Points to redeem"
            aria-label="Reward points to redeem"
            className="w-full"
          />
          <Button type="submit" variant="soft" className="w-full" loading={redeem.isPending} disabled={!points}>
            Redeem
          </Button>
        </form>
      ) : (
        <p className="text-sm text-ink-500">You don't have any reward points yet.</p>
      )}
    </div>
  )
}

export function CartPage() {
  const toast = useToast()
  const cart = useCart()

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

  const subtotal = Number(data.subtotal)
  const discount = Number(data.discount)
  const coupon = data.coupon
  const couponDiscount = coupon?.is_valid ? Number(coupon.discount) : 0
  const rewardPoints = data.reward_points
  const rewardPointsDiscount = rewardPoints?.is_valid ? Number(rewardPoints.discount) : 0
  // `subtotal` is already net of item-level discounts (that is what "You
  // save" reports against list price), so only the coupon and redeemed
  // points adjust it further here. Delivery is quoted and added at
  // checkout, once there is an address to quote it against.
  const total = subtotal - couponDiscount - rewardPointsDiscount

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

          <div className="flex justify-end px-1">
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

            <div className="mt-3 flex flex-col gap-2">
              <CouponBox coupon={coupon} />
              <RewardPointsBox rewardPoints={rewardPoints} balance={Number(data.reward_points_balance ?? 0)} />
            </div>

            <dl className="mt-3 flex flex-col gap-2 border-t border-ink-100 pt-3 text-sm">
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

              {rewardPointsDiscount > 0 && (
                <div className="flex justify-between">
                  <dt className="text-ink-600">Points ({rewardPoints.points})</dt>
                  <dd className="tabular font-medium text-accent-600">− {money(rewardPointsDiscount)}</dd>
                </div>
              )}

              <div className="flex justify-between border-t border-ink-100 pt-2 text-base font-semibold">
                <dt className="text-ink-900">Total</dt>
                <dd className="tabular text-brand-800">{money(total)}</dd>
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

            <p className="mt-2 text-center text-xs text-ink-500">
              Cash on delivery available. Delivery charge is calculated at checkout.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
