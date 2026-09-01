import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, Minus, Plus, ShoppingCart } from 'lucide-react'
import { Button, useToast } from '../../components/ui'
import { useTranslation } from '../../lib/i18n'
import { useAddToCart } from './useCart'
import { useCartDrawer } from './useCartDrawer'

/**
 * The buy box.
 *
 * Availability comes from the variation the API sent, which already has
 * everyone else's held stock subtracted -- so "3 left" means three a shopper
 * can actually have, not three that exist somewhere in other people's carts.
 */
export function AddToCart({ variation, compact = false }) {
  const { t } = useTranslation()
  const toast = useToast()
  const addToCart = useAddToCart()
  const [quantity, setQuantity] = useState(1)
  const [added, setAdded] = useState(false)

  const available = Number(variation?.available_quantity ?? variation?.available ?? 0)
  const inStock = available > 0
  const canBuy = Boolean(variation) && inStock && !addToCart.isPending

  const add = () => {
    if (!variation) return

    addToCart.mutate(
      { variationId: variation.id, quantity },
      {
        onSuccess() {
          setAdded(true)

          // Slide the basket out. This is the whole point of a side cart:
          // you see what you just added, and what it comes to, without
          // being taken off the page you were shopping on.
          useCartDrawer.getState().show()

          // Long enough to register, short enough that the button is ready
          // again before someone tries to add a second item.
          setTimeout(() => setAdded(false), 2000)
        },
        onError(error) {
          toast.error(error?.message ?? t('cart.addFailed'))
        },
      },
    )
  }

  if (compact) {
    return (
      <Button size="sm" className="w-full justify-center" onClick={add} disabled={!canBuy} loading={addToCart.isPending}>
        {added ? (
          <>
            <Check className="h-4 w-4" aria-hidden="true" />
            {t('cart.added')}
          </>
        ) : (
          <>
            <ShoppingCart className="h-4 w-4" aria-hidden="true" />
            {inStock ? t('cart.addToCart') : t('cart.outOfStock')}
          </>
        )}
      </Button>
    )
  }

  return (
    <div className="rounded-card border border-ink-200 bg-white p-4">
      {inStock ? (
        <p className="text-sm text-ink-600">
          <span className="font-semibold text-success-700">{t('cart.inStock')}</span>
          {available <= 5 && (
            <span className="text-ink-500"> {t('cart.onlyLeft', { count: available })}</span>
          )}
        </p>
      ) : (
        <p className="text-sm font-semibold text-danger-700">{t('cart.outOfStock')}</p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <div className="inline-flex items-center rounded-lg border border-ink-200">
          <button
            type="button"
            onClick={() => setQuantity((q) => Math.max(1, q - 1))}
            disabled={quantity <= 1 || !inStock}
            aria-label={t('cart.reduceQuantity')}
            className="grid h-10 w-10 place-items-center rounded-l-lg text-ink-600 enabled:hover:bg-ink-50 disabled:opacity-40"
          >
            <Minus className="h-4 w-4" aria-hidden="true" />
          </button>

          <span className="tabular w-12 text-center font-semibold text-ink-900">{quantity}</span>

          <button
            type="button"
            // Capped at what is actually available, so the failure happens
            // here rather than as a server error after a click.
            onClick={() => setQuantity((q) => Math.min(available, q + 1))}
            disabled={quantity >= available || !inStock}
            aria-label={t('cart.increaseQuantity')}
            className="grid h-10 w-10 place-items-center rounded-r-lg text-ink-600 enabled:hover:bg-ink-50 disabled:opacity-40"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <Button
          className="flex-1"
          onClick={add}
          disabled={!canBuy}
          loading={addToCart.isPending}
        >
          {added ? (
            <>
              <Check className="h-4 w-4" aria-hidden="true" />
              {t('cart.addedToCart')}
            </>
          ) : (
            <>
              <ShoppingCart className="h-4 w-4" aria-hidden="true" />
              {t('cart.addToCart')}
            </>
          )}
        </Button>
      </div>

      {added && (
        <Link
          to="/cart"
          className="mt-3 block text-center text-sm font-medium text-brand-800 hover:text-brand-800"
        >
          {t('cart.viewCart')} →
        </Link>
      )}
    </div>
  )
}
