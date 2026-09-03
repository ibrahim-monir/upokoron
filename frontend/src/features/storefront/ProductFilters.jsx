import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { SlidersHorizontal, Star, X } from 'lucide-react'

import { get } from '../../lib/api'
import { cx, money } from '../../lib/format'

/**
 * Keys the sidebar narrows a listing by, so the page can clear them as a
 * set. `sort` is not among them: it is an ordering, not a filter, and
 * "clear filters" should not quietly put the list back into newest-first.
 */
export const FILTER_KEYS = ['min_price', 'max_price', 'min_rating']

/** Only what the API implements. Offering a sort the backend ignores looks like a bug. */
export const SORTS = [
  { value: '', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'price', label: 'Price: low to high' },
  { value: 'price_desc', label: 'Price: high to low' },
  { value: 'name', label: 'Name A-Z' },
  { value: 'name_desc', label: 'Name Z-A' },
]

/**
 * What the filters can offer here.
 *
 * Keyed on category and search only -- the same scope the endpoint computes
 * on -- so ticking a brand does not rebuild the list of brands you are
 * choosing from.
 */
function useFilterOptions({ category, search }) {
  return useQuery({
    queryKey: ['shop', 'product-filters', { category, search }],
    queryFn: () =>
      get('/shop/product-filters', {
        params: { category: category || undefined, search: search || undefined },
      }),
    staleTime: 5 * 60 * 1000,
    select: (response) => response.data,
  })
}

function Block({ title, children }) {
  return (
    <div className="border-b border-ink-200 pb-4 last:border-0 last:pb-0">
      <h3 className="mb-2.5 text-xs font-semibold uppercase tracking-[0.08em] text-ink-500">
        {title}
      </h3>
      {children}
    </div>
  )
}

function Choice({ checked, onChange, children, count }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 py-1 text-sm text-ink-700 hover:text-brand-800">
      <input
        type="radio"
        checked={checked}
        onChange={onChange}
        className="h-3.5 w-3.5 shrink-0 accent-brand-600"
      />
      <span className="min-w-0 flex-1">{children}</span>
      {count != null && <span className="shrink-0 text-xs tabular-nums text-ink-400">{count}</span>}
    </label>
  )
}

/**
 * Price is two boxes, not a slider.
 *
 * A slider is pleasant to drag and impossible to type into, and the number a
 * shopper has in mind is usually exact -- "under 2000" -- rather than
 * somewhere along a track. The range from the catalogue fills the
 * placeholders, so the boxes still say what things here actually cost.
 */
function PriceBlock({ range, min, max, onApply }) {
  const [low, setLow] = useState(min)
  const [high, setHigh] = useState(max)

  // The URL is the source of truth: clearing the filters empties the boxes.
  useEffect(() => setLow(min), [min])
  useEffect(() => setHigh(max), [max])

  const submit = (event) => {
    event.preventDefault()

    // Blur fires whenever the box is tabbed through, and applying a filter
    // resets the page number -- so an untouched box would quietly send
    // someone reading page 4 back to page 1.
    if (low.trim() === min && high.trim() === max) return

    onApply({ min_price: low.trim(), max_price: high.trim() })
  }

  return (
    <form onSubmit={submit} className="flex items-center gap-2">
      <input
        type="number"
        inputMode="numeric"
        min="0"
        value={low}
        onChange={(event) => setLow(event.target.value)}
        onBlur={submit}
        placeholder={String(range.min)}
        aria-label="Lowest price"
        className="h-9 w-full min-w-0 rounded-lg border border-ink-200 px-2 text-sm"
      />
      <span className="shrink-0 text-ink-400">–</span>
      <input
        type="number"
        inputMode="numeric"
        min="0"
        value={high}
        onChange={(event) => setHigh(event.target.value)}
        onBlur={submit}
        placeholder={String(range.max)}
        aria-label="Highest price"
        className="h-9 w-full min-w-0 rounded-lg border border-ink-200 px-2 text-sm"
      />
      <button type="submit" className="sr-only">
        Apply price range
      </button>
    </form>
  )
}

function Stars({ count }) {
  return (
    <span className="flex items-center gap-0.5" aria-hidden="true">
      {Array.from({ length: 5 }).map((_, index) => (
        <Star
          key={index}
          className={cx(
            'h-3.5 w-3.5',
            index < count ? 'fill-warning-500 text-warning-500' : 'text-ink-300',
          )}
        />
      ))}
    </span>
  )
}

/**
 * The category page's sidebar.
 *
 * Every block hides itself when it has nothing to offer -- one brand, one
 * price, no sub-categories -- because a filter that cannot change the result
 * is a control that lies about what it does. Switching one off in
 * Admin > Settings > Filters is a different statement: never show this,
 * whatever the catalogue holds.
 *
 * On phones it is a disclosure, closed, so the products stay at the top of
 * the page where someone came to see them. From lg up it is a plain panel
 * that cannot be collapsed by accident.
 */
export function ProductFilters({ settings, categories, category, search, sort, params, onChange }) {
  const options = useFilterOptions({ category, search })

  const range = options.data?.price ?? null
  const ratings = (options.data?.ratings ?? []).filter((step) => step.product_count > 0)

  const minPrice = params.get('min_price') ?? ''
  const maxPrice = params.get('max_price') ?? ''
  const minRating = params.get('min_rating') ?? ''

  // Sub-categories of where we are; failing that, the top level. Both are a
  // way further into the catalogue, which is what the block is for.
  const here = categories.find((one) => one.slug === category)
  const siblings = here?.children?.length ? here.children : categories

  const showCategories = settings?.show_category_filter !== false && siblings.length > 1
  const showSort = settings?.show_sort_filter !== false
  const showPrice = settings?.show_price_filter !== false && range !== null && range.min < range.max
  const showRating = settings?.show_rating_filter !== false && ratings.length > 0

  const activeCount = [minPrice, maxPrice, minRating].filter(Boolean).length

  if (!showCategories && !showSort && !showPrice && !showRating) return null

  const clear = () => onChange(Object.fromEntries(FILTER_KEYS.map((key) => [key, ''])))

  const heading = (
    <span className="flex items-center gap-2 text-sm font-semibold text-ink-900">
      <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
      Filters
      {activeCount > 0 && (
        <span className="grid h-5 min-w-5 place-items-center rounded-full bg-brand-600 px-1.5 text-[11px] font-bold text-white">
          {activeCount}
        </span>
      )}
    </span>
  )

  const body = (
    <div className="flex flex-col gap-4 px-4 pb-4">
      {activeCount > 0 && (
        <button
          type="button"
          onClick={clear}
          className="flex w-fit items-center gap-1 text-xs font-semibold text-ink-500 hover:text-danger-700"
        >
          <X className="h-3 w-3" aria-hidden="true" />
          Clear all filters
        </button>
      )}

      {showCategories && (
        <Block title="Shop by category">
          <ul className="flex flex-col">
            {siblings.map((one) => (
              <li key={one.id}>
                <Link
                  to={`/category/${one.slug}`}
                  aria-current={one.slug === category ? 'page' : undefined}
                  className={cx(
                    'flex items-center justify-between gap-2 py-1 text-sm hover:text-brand-800',
                    one.slug === category ? 'font-semibold text-brand-800' : 'text-ink-700',
                  )}
                >
                  <span className="min-w-0 truncate">{one.name}</span>
                  {one.product_count > 0 && (
                    <span className="shrink-0 text-xs tabular-nums text-ink-400">
                      {one.product_count}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </Block>
      )}

      {showSort && (
        <Block title="Sort">
          <div className="flex flex-col">
            {SORTS.map((option) => (
              <Choice
                key={option.value || 'default'}
                checked={sort === option.value}
                onChange={() => onChange({ sort: option.value })}
              >
                {option.label}
              </Choice>
            ))}
          </div>
        </Block>
      )}

      {showPrice && (
        <Block
          title={`Price range · ${money(range.min, { decimals: 0 })} – ${money(range.max, { decimals: 0 })}`}
        >
          <PriceBlock range={range} min={minPrice} max={maxPrice} onApply={onChange} />
        </Block>
      )}

      {showRating && (
        <Block title="Rating">
          <div className="flex flex-col">
            {ratings.map((step) => (
              <Choice
                key={step.value}
                checked={minRating === String(step.value)}
                // Clicking the chosen one again clears it: a radio group with
                // no way out traps someone in a filter they only meant to try.
                onChange={() =>
                  onChange({ min_rating: minRating === String(step.value) ? '' : step.value })
                }
                count={step.product_count}
              >
                <span className="flex items-center gap-1.5">
                  <Stars count={step.value} />
                  <span className="text-xs text-ink-500">&amp; up</span>
                </span>
              </Choice>
            ))}
          </div>
        </Block>
      )}
    </div>
  )

  return (
    <aside className="lg:sticky lg:top-20 lg:w-64 lg:shrink-0 lg:self-start">
      <details className="rounded-card border border-ink-200 bg-white lg:hidden">
        <summary className="flex cursor-pointer list-none items-center justify-between p-4">
          {heading}
          <span className="text-xs font-semibold text-brand-700">Change</span>
        </summary>
        {body}
      </details>

      <div className="hidden rounded-card border border-ink-200 bg-white lg:block">
        <div className="p-4 pb-2">{heading}</div>
        {body}
      </div>
    </aside>
  )
}
