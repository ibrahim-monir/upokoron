import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ImageOff, Package, Plus, Search, X } from 'lucide-react'
import { useList, useWrite } from './useResource'
import { api, get } from '../../lib/api'
import { cx, money } from '../../lib/format'
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
  useToast,
} from '../../components/ui'

const STATUS_TONE = { active: 'success', draft: 'neutral', archived: 'warning' }

export default function ProductsPage() {
  const can = useAuthStore((state) => state.can)
  const navigate = useNavigate()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [params, setParams] = useSearchParams()
  const [search, setSearch] = useState(params.get('search') ?? '')
  const [selected, setSelected] = useState(new Set())

  const bulk = useMutation({
    mutationFn: async (payload) => {
      const { data } = await api.post('/admin/products/bulk', payload)

      return data
    },
  })

  const query = useList('admin.products', '/admin/products', {
    search: params.get('search') || undefined,
    status: params.get('status') || undefined,
    category_id: params.get('category_id') || undefined,
    stock: params.get('stock') || undefined,
    page: Number(params.get('page') ?? 1),
  })

  const categories = useQuery({
    queryKey: ['admin', 'categories', 'options'],
    queryFn: () => get('/admin/categories'),
    staleTime: 5 * 60 * 1000,
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

  /*
   * Selection is cleared whenever the filters change.
   *
   * Keeping it would let someone tick six products, filter to a different
   * category, and then act on rows they can no longer see -- which is how a
   * bulk archive hits the wrong forty products.
   */
  const filterKey = params.toString()

  useEffect(() => {
    setSelected(new Set())
  }, [filterKey])

  const toggle = (id) => {
    setSelected((previous) => {
      const next = new Set(previous)

      next.has(id) ? next.delete(id) : next.add(id)

      return next
    })
  }

  const allOnPageSelected = products.length > 0 && products.every((product) => selected.has(product.id))

  const runBulk = (payload, question) => {
    if (question && !window.confirm(question)) return

    bulk.mutate(
      { ids: [...selected], ...payload },
      {
        onSuccess(data) {
          toast.success(data.message)
          setSelected(new Set())
          queryClient.invalidateQueries({ queryKey: ['admin.products'] })
        },
        onError(error) {
          toast.error(error?.message ?? 'That did not work.')
        },
      },
    )
  }

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

      {/*
        One row, not a stacked block. The filters are a single toolbar: they
        wrap only on a phone, and on anything wider they stay inline so the
        table starts near the top of the screen instead of being pushed down
        by its own controls.
      */}
      <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
        <form
          onSubmit={(event) => {
            event.preventDefault()
            update({ search })
          }}
          className="relative min-w-48 flex-1"
        >
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400"
            aria-hidden="true"
          />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search name, SKU or barcode"
            aria-label="Search products"
            className="pl-9"
          />
        </form>

        <Select
          value={params.get('status') ?? ''}
          onChange={(event) => update({ status: event.target.value })}
          aria-label="Filter by status"
          className="w-32 shrink-0"
        >
          <option value="">Status</option>
          <option value="active">Active</option>
          <option value="draft">Draft</option>
          <option value="archived">Archived</option>
        </Select>

        <Select
          value={params.get('category_id') ?? ''}
          onChange={(event) => update({ category_id: event.target.value })}
          aria-label="Filter by category"
          className="w-40 shrink-0"
        >
          <option value="">Category</option>
          {(categories.data?.data ?? []).map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </Select>

        {/*
          Measured on what can actually be sold, not what is on the shelf:
          stock sitting in someone else's basket is not available to anyone
          else, so "out of stock" means out of sellable stock.
        */}
        <Select
          value={params.get('stock') ?? ''}
          onChange={(event) => update({ stock: event.target.value })}
          aria-label="Filter by stock"
          className="w-36 shrink-0"
        >
          <option value="">Stock</option>
          <option value="in">In stock</option>
          <option value="low">Running low</option>
          <option value="out">Out of stock</option>
        </Select>

        {/* Only once something is filtered, so the row is not carrying a dead
            button the rest of the time. */}
        {[...params.keys()].some((key) => key !== 'page') && (
          <button
            type="button"
            onClick={() => {
              setSearch('')
              setParams(new URLSearchParams())
            }}
            className="inline-flex h-10 shrink-0 items-center gap-1 rounded-lg px-2.5 text-sm font-medium text-ink-600 transition-colors hover:bg-ink-100 hover:text-ink-900"
          >
            <X className="h-4 w-4" aria-hidden="true" />
            Clear
          </button>
        )}
      </div>

      {/*
        The bulk bar only exists while something is ticked, so the page is not
        carrying a row of disabled buttons the rest of the time.
      */}
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-card border border-brand-300 bg-brand-50 p-3">
          <p className="text-sm font-medium text-ink-900">
            {selected.size} selected
          </p>

          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="text-sm text-ink-600 underline hover:text-ink-900"
          >
            Clear
          </button>

          <div className="ml-auto flex flex-wrap gap-2">
            {can('products.update') && (
              <>
                <Button
                  size="sm"
                  variant="secondary"
                  loading={bulk.isPending}
                  onClick={() => runBulk({ action: 'status', status: 'active' })}
                >
                  Publish
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  loading={bulk.isPending}
                  onClick={() => runBulk({ action: 'status', status: 'draft' })}
                >
                  Move to draft
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  loading={bulk.isPending}
                  onClick={() => runBulk({ action: 'feature' })}
                >
                  Feature
                </Button>
              </>
            )}

            {can('products.delete') && (
              <Button
                size="sm"
                variant="danger"
                loading={bulk.isPending}
                onClick={() =>
                  runBulk(
                    { action: 'delete' },
                    `Archive ${selected.size} product(s)? Their order history is kept.`,
                  )
                }
              >
                Archive
              </Button>
            )}
          </div>
        </div>
      )}

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
                <Th className="w-10">
                  <input
                    type="checkbox"
                    checked={allOnPageSelected}
                    onChange={(event) =>
                      setSelected(
                        event.target.checked
                          ? new Set(products.map((product) => product.id))
                          : new Set(),
                      )
                    }
                    aria-label="Select every product on this page"
                    className="h-4 w-4 rounded border-ink-300 text-brand-600"
                  />
                </Th>
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
                <tr
                  key={product.id}
                  className={cx('hover:bg-ink-50', selected.has(product.id) && 'bg-brand-50')}
                >
                  <Td>
                    <input
                      type="checkbox"
                      checked={selected.has(product.id)}
                      onChange={() => toggle(product.id)}
                      aria-label={`Select ${product.name}`}
                      className="h-4 w-4 rounded border-ink-300 text-brand-600"
                    />
                  </Td>
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
