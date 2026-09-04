import { useQuery } from '@tanstack/react-query'
import { useParams, useSearchParams } from 'react-router-dom'
import { PackageOpen } from 'lucide-react'
import { get } from '../../lib/api'
import { EmptyState, ErrorState, Pagination } from '../../components/ui'
import { PRODUCT_GRID_WITH_SIDEBAR, ProductCard, ProductCardSkeleton } from './ProductCard'
import { FILTER_KEYS, ProductFilters } from './ProductFilters'

function useSidebarData() {
  const settings = useQuery({
    queryKey: ['shop', 'settings'],
    queryFn: () => get('/shop/settings'),
    staleTime: 5 * 60 * 1000,
    select: (response) => response.data,
  })

  const categories = useQuery({
    queryKey: ['shop', 'categories'],
    queryFn: () => get('/shop/categories'),
    staleTime: 5 * 60 * 1000,
    select: (response) => response.data,
  })

  return { settings: settings.data, categories: categories.data ?? [] }
}

/**
 * "integrated-circuits-ic" -> "Integrated Circuits Ic".
 *
 * Only ever a stand-in. The catalogue's own name is the real heading, and it
 * knows things a slug cannot spell back -- capitals inside a word, an
 * ampersand, "(IC)". This covers the moment before that list has loaded, and
 * a slug that matches no category at all.
 */
function titleFromSlug(slug) {
  return slug.replace(/-/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

export function ProductListPage() {
  // /category/:slug is the canonical link now; ?category= still works for
  // anything still pointing at the old /products?category= form.
  const { slug } = useParams()
  const [params, setParams] = useSearchParams()

  const search = params.get('search') ?? ''
  const sort = params.get('sort') ?? ''
  const category = slug || params.get('category') || ''
  const page = Number(params.get('page') ?? 1)

  const { settings, categories } = useSidebarData()

  // Every sidebar filter, straight off the URL. The URL is the whole state:
  // a filtered listing is then a link somebody can send, and the back button
  // undoes one filter rather than the entire visit.
  const filters = Object.fromEntries(
    FILTER_KEYS.map((key) => [key, params.get(key) || undefined]),
  )

  const query = useQuery({
    // sort rides in with the rest: it is one of the sidebar's own controls,
    // and naming it twice is two places to forget to change.
    queryKey: ['shop', 'products', { search, category, page, ...filters }],
    queryFn: () =>
      get('/shop/products', {
        params: {
          search: search || undefined,
          category: category || undefined,
          page,
          ...filters,
        },
      }),
    placeholderData: (previous) => previous,
  })

  const update = (patch) => {
    const next = new URLSearchParams(params)

    Object.entries(patch).forEach(([key, value]) => {
      if (value === '' || value == null) next.delete(key)
      else next.set(key, String(value))
    })

    // Any change to the filters invalidates the page number.
    if (!('page' in patch)) next.delete('page')

    setParams(next)
  }

  const products = query.data?.data ?? []

  /*
   * What the shop calls this category, not what the URL spells it.
   *
   * The heading used to be the slug with its hyphens swapped for spaces,
   * so a page about Components was titled "components" and Integrated
   * Circuits (IC) would have read "integrated circuits ic". The name lives
   * in the category list the sidebar already loads; a child is looked up
   * too, since /category/diodes is as valid a page as its parent.
   */
  const categoryName = category
    ? categories.reduce((found, parent) => {
        if (found) return found
        if (parent.slug === category) return parent.name

        return parent.children?.find((child) => child.slug === category)?.name ?? null
      }, null)
    : null

  const grid = (
    <div className="flex flex-col gap-6">
      {/* Sort moved into the sidebar, so the heading has the row to itself. */}
      <div>
        <h1 className="text-2xl font-semibold text-ink-900">
          {search
            ? `Results for “${search}”`
            : category
              ? categoryName ?? titleFromSlug(category)
              : 'All products'}
        </h1>
        {query.data?.meta && (
          <p className="mt-1 text-sm text-ink-500">{query.data.meta.total} product(s)</p>
        )}
      </div>

      {query.isError && <ErrorState error={query.error} onRetry={query.refetch} />}

      {query.isLoading ? (
        <div className={PRODUCT_GRID_WITH_SIDEBAR}>
          {Array.from({ length: 8 }).map((_, index) => (
            <ProductCardSkeleton key={index} />
          ))}
        </div>
      ) : products.length === 0 ? (
        <EmptyState
          icon={PackageOpen}
          title="Nothing here yet"
          description={
            search
              ? 'No product matched that search. Try a different word.'
              : 'No products have been published yet.'
          }
        />
      ) : (
        <div className={PRODUCT_GRID_WITH_SIDEBAR}>
          {products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      )}

      <Pagination meta={query.data?.meta} onPage={(next) => update({ page: next })} />
    </div>
  )

  return (
    // Flex, not a two-column grid: when every filter block is switched off
    // or empty the sidebar renders nothing, and a grid would still hold its
    // 16rem column and its gap open beside the products.
    <div className="flex flex-col gap-6 lg:flex-row lg:gap-8">
      <ProductFilters
        settings={settings}
        categories={categories}
        category={category}
        search={search}
        sort={sort}
        params={params}
        onChange={update}
      />

      <div className="min-w-0 flex-1">{grid}</div>
    </div>
  )
}
