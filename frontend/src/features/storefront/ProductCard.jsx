import { Link } from 'react-router-dom'
import { Gift, Heart, ImageOff, Star } from 'lucide-react'
import { cx, money } from '../../lib/format'
import { AddToCart } from '../cart/AddToCart'
import { useWishlistStore } from '../../stores/wishlistStore'

/**
 * The grid every product listing uses.
 *
 * Declared once because it had drifted: five listings each wrote their own
 * columns, and they had fallen out of step -- related products stopped at
 * four across, the loading skeleton used a different gap from the grid it
 * was standing in for. Five once there is room for them at xl, four on a
 * laptop, stepping down from there.
 */
export const PRODUCT_GRID =
  'grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5'

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

/**
 * The same discount as a percentage, for the flag on the card.
 *
 * Rounded, and null below half a percent: "0% off" is worse than no badge,
 * and a rounding artefact on a two-taka saving is not a promotion.
 */
function savingPercent(price, wasPrice) {
  const now = Number(price ?? 0)
  const before = Number(wasPrice ?? 0)

  if (!before || before <= now) return null

  const percent = Math.round((1 - now / before) * 100)

  return percent > 0 ? percent : null
}

export function ProductCard({ product }) {
  const variation = product.default_variation
  const price = variation?.effective_price ?? variation?.selling_price
  const wasPrice = variation?.is_on_sale ? variation.selling_price : variation?.compare_at_price
  const discount = saving(price, wasPrice)
  const discountPercent = savingPercent(price, wasPrice)

  const rating = Number(product.rating_avg ?? 0)
  const sold = Number(product.sold_count ?? 0)

  const saved = useWishlistStore((state) =>
    state.items.some((item) => item.id === product.id),
  )
  const toggleWishlist = useWishlistStore((state) => state.toggle)

  return (
    /*
     * h-full, so the card fills whatever cell it is given.
     *
     * A grid item stretches on its own, but inside the carousel rail the
     * card sits in a fixed-width wrapper and would otherwise shrink to its
     * own content -- leaving short-named products visibly stubby next to
     * long-named ones in the same row.
     */
    <div className="group relative flex h-full flex-col overflow-hidden rounded-lg border border-ink-200 bg-white transition-shadow hover:shadow-raised">
      {discountPercent !== null && (
        <span className="absolute left-2.5 top-2.5 z-10 rounded-full bg-sale-600 px-2 py-0.5 text-[11px] font-bold leading-5 text-white">
          − {discountPercent}%
        </span>
      )}

      <button
        type="button"
        onClick={() => toggleWishlist(product)}
        aria-pressed={saved}
        aria-label={
          saved
            ? `Remove ${product.name} from your wishlist`
            : `Save ${product.name} to your wishlist`
        }
        title={saved ? 'Saved to your wishlist' : 'Save to your wishlist'}
        className={cx(
          'absolute right-2 top-2 z-10 grid h-8 w-8 place-items-center rounded-full bg-white/85 backdrop-blur transition-colors hover:bg-white',
          saved ? 'text-danger-500 hover:text-danger-700' : 'text-brand-800 hover:text-brand-800',
        )}
      >
        <Heart
          className="h-4.5 w-4.5"
          fill={saved ? 'currentColor' : 'none'}
          aria-hidden="true"
        />
      </button>

      <Link to={`/products/${product.slug}`} className="block aspect-square overflow-hidden bg-ink-100">
        {product.primary_image ? (
          <img
            src={product.primary_image}
            alt={product.name}
            loading="lazy"
            className="h-full w-full object-contain transition-transform duration-300 group-hover:scale-105"
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
          // Two lines, always: clamped so a long name cannot push the card
          // taller, and min-height so a short one does not pull the price up
          // to a different level from the card beside it.
          className="line-clamp-2 min-h-[2.5rem] text-sm font-medium leading-snug text-ink-900 hover:text-brand-800"
        >
          {product.name}
        </Link>

        <div className="mt-auto flex items-baseline gap-2 pt-1">
          <span className="tabular text-lg font-bold text-brand-800">{money(price)}</span>
          {discount !== null && (
            <span className="tabular text-sm text-ink-400 line-through">{money(wasPrice)}</span>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 text-xs text-ink-500">
          <div className="flex items-center gap-1.5">
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

          {Number(variation?.reward_points) > 0 && (
            <span className="flex shrink-0 items-center gap-1 font-medium text-accent-600">
              <Gift className="h-3.5 w-3.5" aria-hidden="true" />
              +{variation.reward_points} pts
            </span>
          )}
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
              className="flex h-8 items-center justify-center rounded-lg border border-brand-200 px-3 text-sm font-medium text-brand-800 transition-colors hover:bg-brand-50"
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
    <div className="flex h-full flex-col overflow-hidden rounded-lg border border-ink-200 bg-white">
      <div className="aspect-square animate-pulse bg-ink-100" />
      <div className="flex flex-1 flex-col gap-2 p-3">
        <div className="h-10 w-full animate-pulse rounded bg-ink-100" />
        <div className="mt-auto h-5 w-1/2 animate-pulse rounded bg-ink-100" />
        <div className="h-3 w-2/3 animate-pulse rounded bg-ink-100" />
        <div className="h-8 w-full animate-pulse rounded-lg bg-ink-100" />
      </div>
    </div>
  )
}
