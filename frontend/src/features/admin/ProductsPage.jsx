import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ImageOff, Package, Plus, Search } from 'lucide-react'
import { useList, useWrite } from './useResource'
import { money } from '../../lib/format'
import { useAuthStore } from '../../stores/authStore'
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  Input,
  Pagination,
  Select,
  Spinner,
  TableWrap,
  Td,
  Th,
} from '../../components/ui'

const STATUS_TONE = { active: 'success', draft: 'neutral', archived: 'warning' }

export default function ProductsPage() {
  const can = useAuthStore((state) => state.can)
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [search, setSearch] = useState(params.get('search') ?? '')

  const query = useList('admin.products', '/admin/products', {
    search: params.get('search') || undefined,
    status: params.get('status') || undefined,
    page: Number(params.get('page') ?? 1),
  })

  const remove = useWrite('admin.products')

  const update = (patch) => {
    const next = new URLSearchParams(params)

    Object.entries(patch).forEach(([key, value]) => {
      if (!value) next.delete(key)
      else next.set(key, String(value))
    })

    if (!('page' in patch)) next.delete('page')

    setParams(next)
  }

  const products = query.data?.data ?? []

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink-900">Products</h1>
          <p className="mt-0.5 text-sm text-ink-500">{query.data?.meta?.total ?? 0} in the catalogue</p>
        </div>

        {can('products.create') && (
          <Button onClick={() => navigate('/admin/products/new')}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            New product
          </Button>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <form
          onSubmit={(event) => {
            event.preventDefault()
            update({ search })
          }}
          className="relative min-w-56 flex-1"
        >
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400"
            aria-hidden="true"
          />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by name, SKU, or barcode"
            aria-label="Search products"
            className="pl-9"
          />
        </form>

        <Select
          value={params.get('status') ?? ''}
          onChange={(event) => update({ status: event.target.value })}
          aria-label="Filter by status"
          className="w-40"
        >
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="draft">Draft</option>
          <option value="archived">Archived</option>
        </Select>
      </div>

      {query.isError && <ErrorState error={query.error} onRetry={query.refetch} />}

      {query.isLoading ? (
        <div className="grid place-items-center py-16">
          <Spinner />
        </div>
      ) : products.length === 0 ? (
        <EmptyState
          icon={Package}
          title="No products yet"
          description="Add your first product to start building the catalogue."
        />
      ) : (
        <>
          <TableWrap>
            <thead>
              <tr>
                <Th>Product</Th>
                <Th>Category</Th>
                <Th>Type</Th>
                <Th numeric>Variations</Th>
                <Th numeric>Price</Th>
                <Th>Status</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {products.map((product) => (
                <tr key={product.id} className="hover:bg-ink-50">
                  <Td>
                    <div className="flex items-center gap-3">
                      <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-lg bg-ink-100">
                        {product.primary_image ? (
                          <img src={product.primary_image} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <ImageOff className="h-4 w-4 text-ink-400" aria-hidden="true" />
                        )}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate font-medium text-ink-900">{product.name}</p>
                        <p className="truncate text-xs text-ink-500">
                          {product.default_variation?.sku ?? product.slug}
                        </p>
                      </div>
                    </div>
                  </Td>
                  <Td>{product.category?.name ?? '—'}</Td>
                  <Td>{product.type === 'variable' ? 'Variable' : 'Simple'}</Td>
                  <Td numeric>{product.variations_count ?? 1}</Td>
                  <Td numeric>{money(product.default_variation?.effective_price ?? 0)}</Td>
                  <Td>
                    <Badge tone={STATUS_TONE[product.status] ?? 'neutral'}>{product.status_label}</Badge>
                  </Td>
                  <Td className="text-right">
                    <div className="flex justify-end gap-2">
                      {can('products.update') && (
                        <Link
                          to={`/admin/products/${product.id}/edit`}
                          className="text-sm font-medium text-brand-700 hover:underline"
                        >
                          Edit
                        </Link>
                      )}
                      {can('products.delete') && (
                        <button
                          type="button"
                          onClick={() => {
                            // Archives rather than deletes: order history
                            // references this product.
                            if (window.confirm(`Archive “${product.name}”? Its history is kept.`)) {
                              remove.mutate({ method: 'delete', url: `/admin/products/${product.id}` })
                            }
                          }}
                          className="text-sm font-medium text-danger-700 hover:underline"
                        >
                          Archive
                        </button>
                      )}
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>

          <Pagination meta={query.data?.meta} onPage={(page) => update({ page })} />
        </>
      )}
    </div>
  )
}
