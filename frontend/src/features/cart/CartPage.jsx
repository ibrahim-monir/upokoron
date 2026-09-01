import { useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, ArrowRight, ImageOff, Minus, Plus, ShoppingBag, Trash2, X } from 'lucide-react'
import { cx, money } from '../../lib/format'
import { useTranslation } from '../../lib/i18n'
import { EmptyState, ErrorState, Spinner, useToast } from '../../components/ui'
import { CheckoutSteps } from '../../components/CheckoutSteps'
import { TrustBadges } from '../../components/TrustBadges'
import { CouponBox, RewardPointsBox } from './RewardFields'
import {
  useCart,
  useClearCart,
  useRemoveCartItem,
  useSetAllSelected,
  useSetItemSelected,
  useUpdateCartItem,
} from './useCart'

/**
 * A checkbox that can show "some, but not all" -- the native `indeterminate`
 * state has no HTML attribute, only a DOM property, so it has to be set
 * imperatively rather than passed as a prop.
 */
function Checkbox({ checked, indeterminate = false, onChange, disabled, 'aria-label': ariaLabel }) {
  const ref = useRef(null)

  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate
  }, [indeterminate])

  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      onChange={(event) => onChange(event.target.checked)}
      disabled={disabled}
      aria-label={ariaLabel}
      className="h-4 w-4 shrink-0 rounded border-ink-300 text-brand-600 focus:ring-brand-500 disabled:opacity-50"
    />
  )
}

/**
 * Quantity stepper.
 *
 * Every change goes to the server, because the server is what holds the
 * stock. There is no optimistic update here on purpose: raising the quantity
 * can fail on stock, and showing "3" for a moment before snapping back to 2
 * teaches shoppers not to trust the number.
 */
function QuantityStepper({ value, onChange, disabled }) {
  const { t } = useTranslation()
  const quantity = Number(value)

  return (
    <div className="inline-flex items-center rounded-lg border border-ink-200">
      <button
        type="button"
        onClick={() => onChange(quantity - 1)}
        disabled={disabled || quantity <= 1}
        aria-label={t('cart.reduceQuantity')}
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
        aria-label={t('cart.increaseQuantity')}
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
function CartRow({ line, busy, onQuantity, onRemove, onSelect }) {
  const { t } = useTranslation()

  // A lapsed hold with nothing left to adjust to -- "change the quantity"
  // would be a lie, so this gets its own harder-stop treatment: red instead
  // of amber, and the stepper disabled, rather than the general "reserved
  // for a while" warning.
  const outOfStock = !line.is_held && Number(line.available) === 0

  return (
    <div className="grid grid-cols-[auto_auto_1fr_auto] items-start gap-3 p-3 sm:grid-cols-[auto_auto_1fr_6rem_9rem_6rem] sm:items-center sm:gap-4 sm:p-4">
      {/*
        Never disabled by stock status -- unchecking a line that has gone
        out of stock, so the rest of the cart can still check out, is
        exactly the case this exists for.
      */}
      <Checkbox
        checked={line.is_selected}
        onChange={(checked) => onSelect(line.id, checked)}
        disabled={busy}
        aria-label={t('cart.selectItem', { name: line.name })}
      />

      <button
        type="button"
        onClick={() => onRemove(line.id)}
        disabled={busy}
        aria-label={t('cart.removeItem', { name: line.name })}
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
          {line.sku && <p className="mt-0.5 text-xs text-ink-400">{t('cart.skuLabel', { sku: line.sku })}</p>}

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
            <p
              className={cx(
                'mt-1 flex items-start gap-1.5 text-xs font-medium',
                outOfStock ? 'text-danger-700' : 'text-warning-700',
              )}
            >
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>
                {t('cart.noLongerReserved')}{' '}
                {outOfStock
                  ? t('cart.outOfStockSuffix')
                  : t('cart.leftInStock', { count: Number(line.available) })}
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

      <div className="col-start-3 row-start-2 sm:col-start-5 sm:row-start-1">
        <QuantityStepper
          value={line.quantity}
          disabled={busy || outOfStock}
          onChange={(next) => onQuantity(line.id, next)}
        />
      </div>

      <div className="tabular col-start-4 row-start-1 self-start text-right text-sm font-semibold text-ink-900 sm:col-start-6 sm:row-start-1 sm:self-center">
        {money(line.line_total)}
      </div>
    </div>
  )
}

export function CartPage() {
  const { t } = useTranslation()
  const toast = useToast()
  const cart = useCart()

  const updateItem = useUpdateCartItem()
  const removeItem = useRemoveCartItem()
  const clearCart = useClearCart()
  const setItemSelected = useSetItemSelected()
  const setAllSelected = useSetAllSelected()

  const busy =
    updateItem.isPending ||
    removeItem.isPending ||
    clearCart.isPending ||
    setItemSelected.isPending ||
    setAllSelected.isPending

  const handle = (mutation, variables) =>
    mutation.mutate(variables, {
      onError: (error) => toast.error(error?.message ?? t('cart.genericFailure')),
    })

  // Removing several selected lines one request at a time (rather than a
  // bulk endpoint) so the same single-item mutation, cache write, and error
  // handling this page already trusts is what runs for each of them.
  const removeSelected = async (itemIds) => {
    for (const itemId of itemIds) {
      try {
        await removeItem.mutateAsync(itemId)
      } catch (error) {
        toast.error(error?.message ?? t('cart.genericFailure'))
        return
      }
    }
  }

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
      <div className="flex flex-col gap-4">
        <CheckoutSteps current="cart" />

        <div className="rounded-card border border-ink-200 bg-white">
          <EmptyState
            icon={ShoppingBag}
            title={t('cart.empty')}
            description={t('cart.emptyBody')}
            action={
              <Link
                to="/products"
                className="inline-block rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
              >
                {t('cart.startShopping')}
              </Link>
            }
          />
        </div>
      </div>
    )
  }

  // The generic "adjust the quantity" banner only makes sense when there is
  // still something to adjust to -- a lapsed hold on a fully out-of-stock
  // line gets its own red, non-actionable warning on the row instead (see
  // CartRow), so it does not double up with advice that would not help it.
  // Scoped to selected lines, same as the backend's own has_unheld_items:
  // a lapsed hold on a line nobody is buying right now has nothing to warn
  // about.
  const hasAdjustableUnheld = lines.some(
    (line) => line.is_selected && !line.is_held && Number(line.available) > 0,
  )

  const selectedCount = lines.filter((line) => line.is_selected).length
  const allSelected = selectedCount === lines.length
  const noneSelected = selectedCount === 0

  const rawQuantity = lines.reduce((sum, line) => sum + Number(line.quantity), 0)
  const totalQuantity = Number.isInteger(rawQuantity) ? rawQuantity : rawQuantity.toFixed(3)
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
      <CheckoutSteps current="cart" />

      <h1 className="text-xl font-semibold text-ink-900">
        {t('cart.title')} <span className="text-ink-400">({lines.length})</span>
      </h1>

      {hasAdjustableUnheld && (
        <div className="flex items-start gap-2 rounded-card border border-warning-500/40 bg-warning-50 p-3 text-sm text-warning-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p>{t('cart.unheldWarning')}</p>
        </div>
      )}

      <div className="flex items-center justify-between gap-3 rounded-card border border-ink-200 bg-white p-3">
        <label className="flex items-center gap-2.5 text-sm font-medium text-ink-700">
          <Checkbox
            checked={allSelected}
            indeterminate={!allSelected && !noneSelected}
            onChange={(checked) => handle(setAllSelected, checked)}
            disabled={busy}
            aria-label={t('cart.selectAll', { count: selectedCount })}
          />
          {t('cart.selectAll', { count: selectedCount })}
        </label>

        <button
          type="button"
          onClick={() => {
            if (window.confirm(t('cart.removeSelectedConfirm', { count: selectedCount }))) {
              removeSelected(lines.filter((line) => line.is_selected).map((line) => line.id))
            }
          }}
          disabled={busy || noneSelected}
          className="inline-flex shrink-0 items-center gap-1.5 text-sm font-medium text-ink-500 hover:text-danger-700 disabled:opacity-50"
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
          {t('cart.removeSelected')}
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <div className="flex flex-col gap-3">
          <div className="overflow-hidden rounded-card border border-ink-200 bg-white">
            {/* Column headers, shown once the row layout has room for them. */}
            <div className="hidden grid-cols-[auto_auto_1fr_6rem_9rem_6rem] gap-4 bg-brand-600 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-white sm:grid">
              <span aria-hidden="true" />
              <span aria-hidden="true" />
              <span>
                {t('cart.productHeader')} <span className="normal-case text-white/70">({lines.length})</span>
              </span>
              <span>{t('cart.priceHeader')}</span>
              <span>
                {t('cart.quantityHeader')} <span className="normal-case text-white/70">({totalQuantity})</span>
              </span>
              <span className="text-right">{t('cart.subtotalHeader')}</span>
            </div>

            <div className="divide-y divide-ink-100">
              {lines.map((line) => (
                <CartRow
                  key={line.id}
                  line={line}
                  busy={busy}
                  onQuantity={(itemId, quantity) => handle(updateItem, { itemId, quantity })}
                  onRemove={(itemId) => handle(removeItem, itemId)}
                  onSelect={(itemId, selected) => handle(setItemSelected, { itemId, selected })}
                />
              ))}
            </div>
          </div>

          <div className="flex justify-end px-1">
            <button
              type="button"
              onClick={() => {
                if (window.confirm(t('cart.clearConfirm'))) handle(clearCart)
              }}
              disabled={busy}
              className="inline-flex shrink-0 items-center gap-1.5 text-sm font-medium text-ink-500 hover:text-danger-700 disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              {t('cart.clearCart')}
            </button>
          </div>

          <TrustBadges />
        </div>

        <div className="flex flex-col gap-4 lg:sticky lg:top-20 lg:self-start">
          <div className="rounded-card border border-ink-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-ink-900">{t('cart.orderSummary')}</h2>

            <div className="mt-3 flex flex-col gap-2">
              <CouponBox coupon={coupon} />
              <RewardPointsBox rewardPoints={rewardPoints} balance={Number(data.reward_points_balance ?? 0)} />
            </div>

            <dl className="mt-3 flex flex-col gap-2 border-t border-ink-100 pt-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-ink-600">{t('cart.items')}</dt>
                <dd className="tabular font-medium text-ink-900">{selectedCount}</dd>
              </div>

              <div className="flex justify-between">
                <dt className="text-ink-600">{t('cart.subtotalHeader')}</dt>
                <dd className="tabular font-medium text-ink-900">{money(subtotal)}</dd>
              </div>

              {discount > 0 && (
                <div className="flex justify-between">
                  <dt className="text-ink-600">{t('cart.youSave')}</dt>
                  <dd className="tabular font-medium text-accent-600">− {money(discount)}</dd>
                </div>
              )}

              {couponDiscount > 0 && (
                <div className="flex justify-between">
                  <dt className="text-ink-600">{t('cart.couponLabel', { code: coupon.code })}</dt>
                  <dd className="tabular font-medium text-accent-600">− {money(couponDiscount)}</dd>
                </div>
              )}

              {rewardPointsDiscount > 0 && (
                <div className="flex justify-between">
                  <dt className="text-ink-600">{t('cart.pointsLabel', { points: rewardPoints.points })}</dt>
                  <dd className="tabular font-medium text-accent-600">− {money(rewardPointsDiscount)}</dd>
                </div>
              )}

              <div className="flex justify-between border-t border-ink-100 pt-2 text-base font-semibold">
                <dt className="text-ink-900">{t('cart.total')}</dt>
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
              aria-disabled={data.has_unheld_items || noneSelected}
              onClick={(event) => {
                if (data.has_unheld_items || noneSelected) event.preventDefault()
              }}
              className={cx(
                'mt-4 flex h-10 w-full items-center justify-center gap-2 rounded-lg text-sm font-medium transition-colors',
                data.has_unheld_items || noneSelected
                  ? 'pointer-events-none bg-ink-200 text-ink-500'
                  : 'bg-brand-600 text-white shadow-card hover:bg-brand-700',
              )}
            >
              {t('cart.proceedToCheckout')}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>

            <p className="mt-2 text-center text-xs text-ink-500">
              {noneSelected ? t('cart.selectAtLeastOne') : t('cart.codAvailable')}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
