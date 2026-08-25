import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Link, useLocation } from 'react-router-dom'
import { ImageOff, Minus, Plus, ShoppingBag, Trash2, X } from 'lucide-react'

import { cx, money } from '../../lib/format'
import { Spinner } from '../../components/ui'
import { useCart, useRemoveCartItem, useUpdateCartItem } from './useCart'
import { useCartDrawer } from './useCartDrawer'

function QuantityStepper({ value, onChange, disabled }) {
  const quantity = Number(value)

  return (
    <div className="inline-flex items-center rounded-lg border border-ink-200">
      <button
        type="button"
        onClick={() => onChange(quantity - 1)}
        disabled={disabled || quantity <= 1}
        aria-label="Reduce quantity"
        className="grid h-8 w-8 place-items-center rounded-l-lg text-ink-600 transition-colors enabled:hover:bg-ink-50 disabled:opacity-40"
      >
        <Minus className="h-3.5 w-3.5" aria-hidden="true" />
      </button>

      <span className="tabular w-8 text-center text-sm font-semibold text-ink-900">
        {quantity % 1 === 0 ? quantity : quantity.toFixed(3)}
      </span>

      <button
        type="button"
        onClick={() => onChange(quantity + 1)}
        disabled={disabled}
        aria-label="Increase quantity"
        className="grid h-8 w-8 place-items-center rounded-r-lg text-ink-600 transition-colors enabled:hover:bg-ink-50 disabled:opacity-40"
      >
        <Plus className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </div>
  )
}

function Line({ line, busy, onQuantity, onRemove }) {
  return (
    <li className="flex gap-3 px-4 py-3.5">
      <Link
        to={`/products/${line.slug}`}
        className="block h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-ink-100"
      >
        {line.image ? (
          <img src={line.image} alt="" loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <span className="grid h-full place-items-center text-ink-300">
            <ImageOff className="h-5 w-5" aria-hidden="true" />
          </span>
        )}
      </Link>

      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <Link
              to={`/products/${line.slug}`}
              className="line-clamp-2 text-sm font-medium text-ink-900 hover:text-brand-800"
            >
              {line.name}
            </Link>

            {line.variation && <p className="mt-0.5 text-xs text-ink-500">{line.variation}</p>}
          </div>

          <button
            type="button"
            onClick={() => onRemove(line.id)}
            disabled={busy}
            aria-label={`Remove ${line.name}`}
            className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-ink-400 transition-colors hover:bg-danger-50 hover:text-danger-700 disabled:opacity-40"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {/*
          A lapsed hold does not empty the basket -- the shopper keeps seeing
          what they picked. But it has to be said, because the stock is no
          longer theirs and checkout will refuse the line.
        */}
        {!line.is_held && (
          <p className="text-xs font-medium text-warning-700">
            No longer reserved
            {Number(line.available) > 0
              ? ` — ${Number(line.available)} left`
              : ' — out of stock'}
          </p>
        )}

        <div className="mt-auto flex items-center justify-between gap-2">
          <QuantityStepper
            value={line.quantity}
            disabled={busy}
            onChange={(next) => onQuantity(line.id, next)}
          />

          <span className="tabular text-sm font-semibold text-ink-900">
            {money(line.line_total)}
          </span>
        </div>
      </div>
    </li>
  )
}

/**
 * The basket, in a panel over the page.
 *
 * Kept separate from the cart page rather than reusing it: this is the
 * glance -- what did I just add, what does it come to -- while the page is
 * the place you work, with coupons, reward points and delivery. Squeezing
 * that into a 26rem panel would make both worse.
 */
export function CartDrawer() {
  const open = useCartDrawer((state) => state.open)
  const hide = useCartDrawer((state) => state.hide)
  const { pathname } = useLocation()

  const { data, isLoading } = useCart()
  const updateItem = useUpdateCartItem()
  const removeItem = useRemoveCartItem()

  const busy = updateItem.isPending || removeItem.isPending
  const lines = data?.items ?? []

  // Navigating away is a decision to be somewhere else, so the panel should
  // not still be sitting over the page when you arrive.
  useEffect(() => {
    hide()
  }, [pathname, hide])

  useEffect(() => {
    if (!open) return undefined

    const onKey = (event) => {
      if (event.key === 'Escape') hide()
    }

    // The page behind must not scroll under the panel; on a phone the panel
    // is the whole screen and scrolling the page moves it out from under
    // the finger.
    const previous = document.body.style.overflow

    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', onKey)

    return () => {
      document.body.style.overflow = previous
      document.removeEventListener('keydown', onKey)
    }
  }, [open, hide])

  return createPortal(
    <div
      aria-hidden={!open}
      className={cx('fixed inset-0 z-50', !open && 'pointer-events-none')}
    >
      <div
        onClick={hide}
        className={cx(
          'absolute inset-0 bg-ink-950/45 transition-opacity duration-300',
          open ? 'opacity-100' : 'opacity-0',
        )}
      />

      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Shopping cart"
        className={cx(
          'absolute inset-y-0 right-0 flex w-full max-w-[26rem] flex-col bg-white shadow-raised',
          'transition-transform duration-300 ease-out',
          open ? 'translate-x-0' : 'translate-x-full',
        )}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-ink-200 px-4 py-3.5">
          <h2 className="flex items-center gap-2 text-base font-semibold text-ink-900">
            Shopping Cart
            {lines.length > 0 && (
              <span className="tabular rounded-full bg-brand-50 px-2 py-0.5 text-xs font-bold text-brand-800">
                {data?.item_count}
              </span>
            )}
          </h2>

          <button
            type="button"
            onClick={hide}
            aria-label="Close cart"
            className="grid h-8 w-8 place-items-center rounded-lg text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-900"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {isLoading ? (
          <div className="grid flex-1 place-items-center">
            <Spinner />
          </div>
        ) : lines.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
            <span className="grid h-14 w-14 place-items-center rounded-full bg-ink-100 text-ink-400">
              <ShoppingBag className="h-6 w-6" aria-hidden="true" />
            </span>

            <p className="font-medium text-ink-900">No items in your cart</p>
            <p className="text-sm text-ink-500">Anything you add will show up here.</p>

            <Link
              to="/products"
              onClick={hide}
              className="mt-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700"
            >
              Browse products
            </Link>
          </div>
        ) : (
          <>
            <ul className="min-h-0 flex-1 divide-y divide-ink-100 overflow-y-auto">
              {lines.map((line) => (
                <Line
                  key={line.id}
                  line={line}
                  busy={busy}
                  onQuantity={(id, quantity) => updateItem.mutate({ itemId: id, quantity })}
                  onRemove={(id) => removeItem.mutate(id)}
                />
              ))}
            </ul>

            <div className="shrink-0 border-t border-ink-200 p-4">
              {Number(data?.discount) > 0 && (
                <div className="mb-1.5 flex items-baseline justify-between text-sm">
                  <span className="text-ink-600">You save</span>
                  <span className="tabular font-medium text-accent-600">
                    − {money(data.discount)}
                  </span>
                </div>
              )}

              <div className="flex items-baseline justify-between">
                <span className="text-sm font-medium text-ink-700">Subtotal</span>
                <span className="tabular text-lg font-bold text-ink-900">
                  {money(data?.subtotal)}
                </span>
              </div>

              <p className="mt-1 text-xs text-ink-500">
                Delivery is worked out at checkout.
              </p>

              <div className="mt-3 grid grid-cols-2 gap-2">
                <Link
                  to="/cart"
                  onClick={hide}
                  className="flex h-10 items-center justify-center rounded-lg border border-ink-200 text-sm font-medium text-ink-800 transition-colors hover:bg-ink-50"
                >
                  View cart
                </Link>

                <Link
                  to="/checkout"
                  onClick={hide}
                  className="flex h-10 items-center justify-center rounded-lg bg-brand-600 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
                >
                  Checkout
                </Link>
              </div>
            </div>
          </>
        )}
      </aside>
    </div>,
    document.body,
  )
}
