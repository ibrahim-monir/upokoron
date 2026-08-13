import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { PackageOpen } from 'lucide-react'
import { get } from '../../lib/api'
import { EmptyState, ErrorState, Pagination, Select } from '../../components/ui'
import { ProductCard, ProductCardSkeleton } from './ProductCard'

// Only what the API actually implements. Offering "price: low to high"
// when the backend ignores it looks like a bug to the customer.
const SORTS = [
  { value: '', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'name', label: 'Name A–Z' },
  { value: 'name_desc', label: 'Name Z–A' },
]

export function ProductListPage() {
  const [params, setParams] = useSearchParams()

  const search = params.get('search') ?? ''
  const sort = params.get('sort') ?? ''
  const category = params.get('category') ?? ''
  const page = Number(params.get('page') ?? 1)

  const query = useQuery({
    queryKey: ['shop', 'products', { search, sort, category, page }],
    queryFn: () =>
      get('/shop/products', {
        params: {
          search: search || undefined,
          sort: sort || undefined,
          category: category || undefined,
          page,
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

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-ink-900">
            {search ? `Results for “${search}”` : category ? category.replace(/-/g, ' ') : 'All products'}
          </h1>
          {query.data?.meta && (
            <p className="mt-1 text-sm text-ink-500">{query.data.meta.total} product(s)</p>
          )}
        </div>

        <label className="flex items-center gap-2 text-sm text-ink-600">
          Sort
          <Select
            value={sort}
            onChange={(event) => update({ sort: event.target.value })}
            className="w-48"
          >
            {SORTS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </label>
      </div>

      {query.isError && <ErrorState error={query.error} onRetry={query.refetch} />}

      {query.isLoading ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
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
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      )}

      <Pagination meta={query.data?.meta} onPage={(next) => update({ page: next })} />
    </div>
  )
}
