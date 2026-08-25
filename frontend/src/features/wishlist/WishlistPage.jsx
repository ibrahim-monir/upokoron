import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQueries } from '@tanstack/react-query'
import { Check, ChevronRight, Copy, Heart, ImageOff, X } from 'lucide-react'

import { get } from '../../lib/api'
import { money } from '../../lib/format'
import { useWishlistStore } from '../../stores/wishlistStore'
import { useAddToCart } from '../cart/useCart'
import { Button, EmptyState, useToast } from '../../components/ui'

/** The variation a wishlist row buys: the default one the API marks. */
function buyableVariation(product) {
  return product?.default_variation ?? product?.variations?.[0] ?? null
}

function StockLabel({ variation }) {
  const available = Number(variation?.available_quantity ?? 0)

  return available > 0 ? (
    <span className="text-sm font-medium text-success-700">In stock</span>
  ) : (
    <span className="text-sm font-medium text-danger-700">Out of stock</span>
  )
}

function Row({ entry, product, loading, onRemove, selected, onToggleSelect }) {
  const toast = useToast()
  const addToCart = useAddToCart()
  const [added, setAdded] = useState(false)

  const variation = buyableVariation(product)
  const available = Number(variation?.available_quantity ?? 0)
  const canBuy = Boolean(variation) && available > 0 && !addToCart.isPending

  const add = () => {
    if (!variation) return

    addToCart.mutate(
      { variationId: variation.id, quantity: 1 },
      {
        onSuccess() {
          setAdded(true)
          setTimeout(() => setAdded(false), 2000)
        },
        onError(error) {
          toast.error(error?.message ?? 'Could not add that to your cart.')
        },
      },
    )
  }

  if (loading) {
    return (
      <li className="flex items-center gap-4 px-4 py-5">
        <span className="h-7 w-7 shrink-0" />
        <span className="h-16 w-16 shrink-0 animate-pulse rounded-lg bg-ink-100" />
        <span className="h-4 w-40 animate-pulse rounded bg-ink-100" />
      </li>
    )
  }

  /*
   * A saved product that no longer resolves has been deleted or unpublished.
   * The row stays only to offer the remove button -- a dead entry with no way
   * to clear it is worse than the gap it leaves.
   */
  if (!product) {
    return (
      <li className="flex items-center gap-4 px-4 py-5">
        <button
          type="button"
          onClick={() => onRemove(entry.id)}
          aria-label="Remove from wishlist"
          className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-700"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>

        <p className="text-sm text-ink-500">This product is no longer available.</p>
      </li>
    )
  }

  return (
    <li className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-3 px-4 py-5 sm:grid-cols-[auto_minmax(0,1fr)_7rem_9rem_8rem_9rem] sm:gap-4">
      <div className="flex flex-col items-center gap-2">
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggleSelect(entry.id)}
          aria-label={`Select ${product.name}`}
          className="h-4 w-4 rounded border-ink-300"
        />

        <button
          type="button"
          onClick={() => onRemove(entry.id)}
          aria-label={`Remove ${product.name} from your wishlist`}
          className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-700"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <div className="flex min-w-0 items-center gap-3">
        <Link
          to={`/products/${product.slug}`}
          className="block h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-ink-100"
        >
          {product.primary_image ? (
            <img
              src={product.primary_image}
              alt={product.name}
              loading="lazy"
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="grid h-full w-full place-items-center text-ink-300">
              <ImageOff className="h-5 w-5" aria-hidden="true" />
            </span>
          )}
        </Link>

        <div className="min-w-0">
          <Link
            to={`/products/${product.slug}`}
            className="block truncate font-medium text-ink-900 hover:text-brand-800"
          >
            {product.name}
          </Link>

          {variation?.name && (
            <p className="mt-0.5 truncate text-sm text-ink-500">{variation.name}</p>
          )}
        </div>
      </div>

      <div>
        <span className="text-xs uppercase tracking-wide text-ink-500 sm:hidden">Price: </span>
        <span className="font-semibold text-ink-900">
          {money(variation?.effective_price ?? variation?.selling_price ?? 0)}
        </span>
      </div>

      <div className="text-sm text-ink-600">
        <span className="text-xs uppercase tracking-wide text-ink-500 sm:hidden">Added: </span>
        {new Date(entry.addedAt).toLocaleDateString('en-GB', {
          day: '2-digit',
          month: 'long',
          year: 'numeric',
        })}
      </div>

      <div>
        <StockLabel variation={variation} />
      </div>

      <div className="sm:justify-self-end">
        <Button
          size="sm"
          onClick={add}
          disabled={!canBuy}
          loading={addToCart.isPending}
          className="w-full sm:w-auto"
        >
          {added ? (
            <>
              <Check className="h-4 w-4" aria-hidden="true" />
              Added
            </>
          ) : (
            'Add to Cart'
          )}
        </Button>
      </div>
    </li>
  )
}

export function WishlistPage() {
  const toast = useToast()
  const items = useWishlistStore((state) => state.items)
  const remove = useWishlistStore((state) => state.remove)
  const clear = useWishlistStore((state) => state.clear)
  const addToCart = useAddToCart()

  const [copied, setCopied] = useState(false)
  const [addingAll, setAddingAll] = useState(false)
  const [selected, setSelected] = useState(() => new Set())

  const toggleSelect = (id) => {
    setSelected((current) => {
      const next = new Set(current)

      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }

      return next
    })
  }

  const removeAndDeselect = (id) => {
    remove(id)
    setSelected((current) => {
      if (!current.has(id)) return current

      const next = new Set(current)
      next.delete(id)

      return next
    })
  }

  /*
   * One query per saved product rather than one bulk call: the storefront has
   * no endpoint that takes a list of ids, and these are individually cached,
   * so arriving here after browsing usually costs no requests at all.
   */
  const results = useQueries({
    queries: items.map((item) => ({
      queryKey: ['shop', 'product', item.slug],
      queryFn: () => get(`/shop/products/${item.slug}`),
      // Same key AND same select as the product page, so the two share one
      // cache entry and cannot disagree about the shape behind it.
      select: (response) => response.data,
      staleTime: 60_000,
      retry: false,
    })),
  })

  const rows = useMemo(
    () =>
      items.map((entry, index) => ({
        entry,
        product: results[index]?.data ?? null,
        loading: results[index]?.isLoading ?? false,
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, results.map((result) => result.status).join()],
  )

  const buyable = rows.filter(
    ({ product }) => Number(buyableVariation(product)?.available_quantity ?? 0) > 0,
  )

  // Selecting specific rows narrows every bulk action to just those; with
  // nothing checked, "select all" is implied and bulk actions cover the
  // whole list, same as before this existed.
  const selectableIds = rows.filter(({ product }) => product).map(({ entry }) => entry.id)
  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selected.has(id))
  const hasSelection = selected.size > 0
  const targets = hasSelection ? buyable.filter(({ entry }) => selected.has(entry.id)) : buyable

  const toggleSelectAll = () => {
    setSelected(allSelected ? new Set() : new Set(selectableIds))
  }

  const shareUrl = `${window.location.origin}/wishlist`

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Could not copy the link.')
    }
  }

  const addAll = async () => {
    if (targets.length === 0) return

    setAddingAll(true)

    let failed = 0

    /*
     * Sequential on purpose. Each add re-prices the basket server-side, and
     * firing them together makes those writes race for the same cart row.
     */
    for (const { product } of targets) {
      try {
        await addToCart.mutateAsync({
          variationId: buyableVariation(product).id,
          quantity: 1,
        })
      } catch {
        failed += 1
      }
    }

    setAddingAll(false)

    if (failed === 0) {
      toast.success(
        `Added ${targets.length} item${targets.length === 1 ? '' : 's'} to your cart.`,
      )
    } else {
      toast.error(`${failed} of ${targets.length} could not be added.`)
    }
  }

  const clearAll = () => {
    if (!window.confirm('Remove everything from your wishlist?')) return

    clear()
    setSelected(new Set())
    toast.success('Wishlist cleared.')
  }

  return (
    <div className="flex flex-col gap-6">
      <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-sm text-ink-500">
        <Link to="/" className="hover:text-ink-900">
          Home
        </Link>
        <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
        <span className="text-ink-900">Wishlist</span>
      </nav>

      <div>
        <h1 className="text-2xl font-semibold text-ink-900">Wishlist</h1>
        <p className="mt-1 text-sm text-ink-600">
          {items.length === 0
            ? 'Nothing saved yet.'
            : `${items.length} item${items.length === 1 ? '' : 's'} saved for later.`}
        </p>
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={Heart}
          title="Your wishlist is empty"
          description="Tap the heart on any product to save it here for later."
          action={
            <Link
              to="/products"
              className="inline-block rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700"
            >
              Browse products
            </Link>
          }
        />
      ) : (
        <>
          <div className="overflow-hidden rounded-card border border-ink-200 bg-white">
            {/* Column headings only make sense once a row is a single line. */}
            <div className="hidden grid-cols-[auto_minmax(0,1fr)_7rem_9rem_8rem_9rem] gap-4 border-b border-ink-200 bg-brand-600 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-white sm:grid">
              <span className="grid w-7 place-items-center">
                {selectableIds.length > 0 && (
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleSelectAll}
                    aria-label="Select all"
                    className="h-4 w-4 rounded border-white/60 bg-transparent"
                  />
                )}
              </span>
              <span>Product</span>
              <span>Price</span>
              <span>Date Added</span>
              <span>Stock Status</span>
              <span />
            </div>

            <ul className="divide-y divide-ink-100">
              {rows.map(({ entry, product, loading }) => (
                <Row
                  key={entry.id}
                  entry={entry}
                  product={product}
                  loading={loading}
                  onRemove={removeAndDeselect}
                  selected={selected.has(entry.id)}
                  onToggleSelect={toggleSelect}
                />
              ))}
            </ul>
          </div>

          <div className="flex flex-col gap-4 rounded-card border border-ink-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-ink-700">Wishlist link:</span>

              <input
                readOnly
                value={shareUrl}
                onFocus={(event) => event.target.select()}
                className="h-9 min-w-0 flex-1 rounded-lg border border-ink-200 bg-ink-50 px-3 text-sm text-ink-600 sm:w-64 sm:flex-none"
              />

              <Button size="sm" variant="secondary" onClick={copyLink}>
                {copied ? (
                  <>
                    <Check className="h-4 w-4" aria-hidden="true" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4" aria-hidden="true" />
                    Copy Link
                  </>
                )}
              </Button>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={clearAll}
                className="text-sm font-medium text-ink-600 underline underline-offset-4 transition-colors hover:text-danger-700"
              >
                Clear Wishlist
              </button>

              <Button onClick={addAll} disabled={targets.length === 0 || addingAll} loading={addingAll}>
                {hasSelection ? `Add Selected to Cart (${targets.length})` : 'Add All to Cart'}
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
