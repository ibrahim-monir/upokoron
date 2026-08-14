import { Link } from 'react-router-dom'
import { Heart, ImageOff, Star } from 'lucide-react'
import { money } from '../../lib/format'
import { AddToCart } from '../cart/AddToCart'

/**
 * The saving, in taka rather than a percentage.
 *
 * Computed from the two prices the API already sends; nothing is invented.
 * Returns null when there is no genuine discount, so the flag simply does
 * not render rather than showing "৳0 off".
 */
function saving(price, wasPrice) {
  const now = Number(price ?? 0)
  const before = Number(wasPrice ?? 0)

  if (!before || before <= now) return null

  return before - now
}

export function ProductCard({ product }) {
  const variation = product.default_variation
  const price = variation?.effective_price ?? variation?.selling_price
  const wasPrice = variation?.is_on_sale ? variation.selling_price : variation?.compare_at_price
  const discount = saving(price, wasPrice)

  const rating = Number(product.rating_avg ?? 0)
  const sold = Number(product.sold_count ?? 0)

  return (
    <div className="group relative flex flex-col overflow-hidden rounded-lg border border-ink-200 bg-white transition-shadow hover:shadow-raised">
      {discount !== null && (
        <span className="absolute left-0 top-2 z-10 rounded-r-md bg-accent-500 px-2 py-1 text-xs font-semibold text-white">
          − {money(discount)}
        </span>
      )}

      <button
        type="button"
        aria-label={`Save ${product.name} to your wishlist`}
        title="Wishlist arrives with the customer accounts module"
        className="absolute right-2 top-2 z-10 grid h-8 w-8 place-items-center rounded-full bg-white/85 text-brand-500 backdrop-blur transition-colors hover:bg-white hover:text-brand-600"
      >
        <Heart className="h-4.5 w-4.5" aria-hidden="true" />
      </button>

      <Link to={`/products/${product.slug}`} className="block aspect-square overflow-hidden bg-ink-100">
        {product.primary_image ? (
          <img
            src={product.primary_image}
            alt={product.name}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <span className="grid h-full place-items-center text-ink-300">
            <ImageOff className="h-9 w-9" aria-hidden="true" />
          </span>
        )}
      </Link>

      <div className="flex flex-1 flex-col gap-1.5 p-3">
        <Link
          to={`/products/${product.slug}`}
          className="line-clamp-2 text-sm font-medium leading-snug text-ink-900 hover:text-brand-600"
        >
          {product.name}
        </Link>

        <div className="mt-auto flex items-baseline gap-2 pt-1">
          <span className="tabular text-lg font-bold text-brand-600">{money(price)}</span>
          {discount !== null && (
            <span className="tabular text-sm text-ink-400 line-through">{money(wasPrice)}</span>
          )}
        </div>

        <div className="flex items-center gap-1.5 text-xs text-ink-500">
          <Star
            className={rating > 0 ? 'h-3.5 w-3.5 fill-amber-400 text-amber-400' : 'h-3.5 w-3.5 text-ink-300'}
            aria-hidden="true"
          />
          <span className="tabular">
            {rating.toFixed(1)}/5 ({product.rating_count ?? 0})
          </span>
          <span aria-hidden="true">·</span>
          <span className="tabular">{sold % 1 === 0 ? sold : sold.toFixed(0)} Sold</span>
        </div>

        {/*
          Straight into the basket for a simple product. A product with
          several variations sends the shopper to the page instead, because
          "add to cart" cannot know which colour they meant.
        */}
        <div className="pt-1">
          {(product.variations_count ?? 1) > 1 ? (
            <Link
              to={`/products/${product.slug}`}
              className="block rounded-lg border border-brand-200 px-3 py-2 text-center text-sm font-medium text-brand-700 transition-colors hover:bg-brand-50"
            >
              Choose options
            </Link>
          ) : (
            <AddToCart variation={variation} compact />
          )}
        </div>
      </div>
    </div>
  )
}

export function ProductCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-lg border border-ink-200 bg-white">
      <div className="aspect-square animate-pulse bg-ink-100" />
      <div className="flex flex-col gap-2 p-3">
        <div className="h-4 w-full animate-pulse rounded bg-ink-100" />
        <div className="h-5 w-1/2 animate-pulse rounded bg-ink-100" />
        <div className="h-3 w-2/3 animate-pulse rounded bg-ink-100" />
      </div>
    </div>
  )
}
