import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Archive,
  BarChart3,
  CheckCircle2,
  ChevronDown,
  Edit3,
  ImageOff,
  MoreHorizontal,
  Package,
  Plus,
  Search,
  SlidersHorizontal,
  Sparkles,
  Tag,
  X,
  XCircle,
} from 'lucide-react'
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
  const [actionsOpen, setActionsOpen] = useState(null)

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
  const products = query.data?.data ?? []
  const total = query.data?.meta?.total ?? 0

  const update = (patch) => {
    const next = new URLSearchParams(params)
    Object.entries(patch).forEach(([key, value]) => {
      if (!value) next.delete(key)
      else next.set(key, String(value))
    })
    if (!('page' in patch)) next.delete('page')
    setParams(next)
  }

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

  const allOnPageSelected =
    products.length > 0 && products.every((product) => selected.has(product.id))

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

  const stats = useMemo(() => {
    const active = products.filter((p) => p.status === 'active').length
    const draft = products.filter((p) => p.status === 'draft').length
    const archived = products.filter((p) => p.status === 'archived').length

    return [
      {
        label: 'All products',
        value: total,
        icon: Package,
        tone: 'text-slate-700 bg-slate-100',
      },
      {
        label: 'Active',
        value: active,
        icon: CheckCircle2,
        tone: 'text-emerald-700 bg-emerald-50',
      },
      {
        label: 'Draft',
        value: draft,
        icon: Sparkles,
        tone: 'text-amber-700 bg-amber-50',
      },
      {
        label: 'Archived',
        value: archived,
        icon: Archive,
        tone: 'text-slate-600 bg-slate-100',
      },
    ]
  }, [products, total])

  const hasFilters = [...params.keys()].some((key) => key !== 'page')

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-5">
      {/* Header */}
      <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-medium text-slate-400">
            <span>Catalogue</span>
            <span>/</span>
            <span className="text-slate-600">Products</span>
          </div>

          <h1 className="text-2xl font-bold tracking-tight text-slate-950">
            Products
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Manage your catalogue, inventory visibility and product status.
          </p>
        </div>

        {can('products.create') && (
          <Button
            onClick={() => navigate('/admin/products/new')}
            className="h-10 shrink-0"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add product
          </Button>
        )}
      </section>

      {/* Overview */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map(({ label, value, icon: Icon, tone }) => (
          <div
            key={label}
            className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-medium text-slate-500">{label}</p>
                <p className="mt-1 text-xl font-bold tracking-tight text-slate-950">
                  {value.toLocaleString()}
                </p>
              </div>
              <span className={cx('grid h-9 w-9 place-items-center rounded-lg', tone)}>
                <Icon className="h-4 w-4" />
              </span>
            </div>
          </div>
        ))}
      </section>

      {/* Filters */}
      <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
          <form
            onSubmit={(event) => {
              event.preventDefault()
              update({ search })
            }}
            className="relative min-w-0 flex-1"
          >
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
              aria-hidden="true"
            />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by product name, SKU or barcode..."
              aria-label="Search products"
              className="h-10 border-slate-200 bg-slate-50 pl-9 focus:bg-white"
            />
          </form>

          <div className="flex flex-wrap gap-2">
            <div className="relative">
              <SlidersHorizontal className="pointer-events-none absolute left-3 top-1/2 z-10 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <Select
                value={params.get('status') ?? ''}
                onChange={(event) => update({ status: event.target.value })}
                aria-label="Filter by status"
                className="h-10 w-32 pl-9"
              >
                <option value="">All status</option>
                <option value="active">Active</option>
                <option value="draft">Draft</option>
                <option value="archived">Archived</option>
              </Select>
            </div>

            <Select
              value={params.get('category_id') ?? ''}
              onChange={(event) => update({ category_id: event.target.value })}
              aria-label="Filter by category"
              className="h-10 w-40"
            >
              <option value="">All categories</option>
              {(categories.data?.data ?? []).map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </Select>

            <Select
              value={params.get('stock') ?? ''}
              onChange={(event) => update({ stock: event.target.value })}
              aria-label="Filter by stock"
              className="h-10 w-36"
            >
              <option value="">All stock</option>
              <option value="in">In stock</option>
              <option value="low">Running low</option>
              <option value="out">Out of stock</option>
            </Select>

            {hasFilters && (
              <button
                type="button"
                onClick={() => {
                  setSearch('')
                  setParams(new URLSearchParams())
                }}
                className="inline-flex h-10 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-900"
              >
                <X className="h-3.5 w-3.5" />
                Clear
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Bulk actions */}
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-slate-900">
              {selected.size} product{selected.size > 1 ? 's' : ''} selected
            </p>
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="text-xs font-medium text-slate-500 hover:text-slate-900"
            >
              Clear selection
            </button>
          </div>

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
        <div className="rounded-xl border border-slate-200 bg-white py-20">
          <div className="grid place-items-center">
            <Spinner />
          </div>
        </div>
      ) : products.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white">
          <EmptyState
            icon={Package}
            title="No products found"
            description="Try changing your filters or add your first product."
          />
        </div>
      ) : (
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Product catalogue</h2>
              <p className="mt-0.5 text-xs text-slate-400">
                Showing {products.length} of {total.toLocaleString()} products
              </p>
            </div>

            <div className="hidden items-center gap-1.5 text-xs text-slate-400 sm:flex">
              <BarChart3 className="h-3.5 w-3.5" />
              Live catalogue
            </div>
          </div>

          <div className="overflow-x-auto">
            <TableWrap>
              <thead>
                <tr className="bg-slate-50/80">
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
                      className="h-4 w-4 rounded border-slate-300 text-brand-600"
                    />
                  </Th>
                  <Th>Product</Th>
                  <Th>Category</Th>
                  <Th>Type</Th>
                  <Th numeric>Variations</Th>
                  <Th numeric>Price</Th>
                  <Th>Status</Th>
                  <Th className="w-12" />
                </tr>
              </thead>

              <tbody>
                {products.map((product) => (
                  <tr
                    key={product.id}
                    className={cx(
                      'group border-t border-slate-100 transition-colors hover:bg-slate-50/70',
                      selected.has(product.id) && 'bg-brand-50/50',
                    )}
                  >
                    <Td>
                      <input
                        type="checkbox"
                        checked={selected.has(product.id)}
                        onChange={() => toggle(product.id)}
                        aria-label={`Select ${product.name}`}
                        className="h-4 w-4 rounded border-slate-300 text-brand-600"
                      />
                    </Td>

                    <Td>
                      <div className="flex min-w-[250px] items-center gap-3">
                        <span className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                          {product.primary_image ? (
                            <img
                              src={product.primary_image}
                              alt=""
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <ImageOff className="h-4 w-4 text-slate-400" />
                          )}
                        </span>

                        <div className="min-w-0">
                          <Link
                            to={`/admin/products/${product.id}/edit`}
                            className="block truncate text-sm font-semibold text-slate-900 hover:text-brand-700"
                          >
                            {product.name}
                          </Link>
                          <div className="mt-0.5 flex items-center gap-1.5">
                            <span className="text-[11px] text-slate-400">
                              SKU
                            </span>
                            <span className="truncate text-xs font-medium text-slate-500">
                              {product.default_variation?.sku ?? product.slug}
                            </span>
                          </div>
                        </div>
                      </div>
                    </Td>

                    <Td>
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600">
                        <Tag className="h-3.5 w-3.5 text-slate-400" />
                        {product.category?.name ?? 'Uncategorized'}
                      </span>
                    </Td>

                    <Td>
                      <span className="rounded-md bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-600">
                        {product.type === 'variable' ? 'Variable' : 'Simple'}
                      </span>
                    </Td>

                    <Td numeric>
                      <span className="text-sm font-medium text-slate-700">
                        {product.variations_count ?? 1}
                      </span>
                    </Td>

                    <Td numeric>
                      <span className="text-sm font-semibold text-slate-900">
                        {money(product.default_variation?.effective_price ?? 0)}
                      </span>
                    </Td>

                    <Td>
                      <Badge tone={STATUS_TONE[product.status] ?? 'neutral'}>
                        {product.status_label}
                      </Badge>
                    </Td>

                    <Td className="text-right">
                      <div className="relative flex justify-end">
                        <button
                          type="button"
                          onClick={() =>
                            setActionsOpen((value) =>
                              value === product.id ? null : product.id,
                            )
                          }
                          className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 opacity-70 transition hover:bg-slate-100 hover:text-slate-900 group-hover:opacity-100"
                          aria-label={`Actions for ${product.name}`}
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </button>

                        {actionsOpen === product.id && (
                          <div className="absolute right-0 top-9 z-20 w-36 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 text-left shadow-xl">
                            {can('products.update') && (
                              <Link
                                to={`/admin/products/${product.id}/edit`}
                                onClick={() => setActionsOpen(null)}
                                className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                              >
                                <Edit3 className="h-3.5 w-3.5" />
                                Edit product
                              </Link>
                            )}

                            {can('products.delete') && (
                              <button
                                type="button"
                                onClick={() => {
                                  setActionsOpen(null)
                                  if (
                                    window.confirm(
                                      `Archive “${product.name}”? Its history is kept.`,
                                    )
                                  ) {
                                    remove.mutate({
                                      method: 'delete',
                                      url: `/admin/products/${product.id}`,
                                    })
                                  }
                                }}
                                className="flex w-full items-center gap-2 px-3 py-2 text-xs font-medium text-rose-600 hover:bg-rose-50"
                              >
                                <XCircle className="h-3.5 w-3.5" />
                                Archive
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          </div>

          <div className="border-t border-slate-100 px-4 py-3">
            <Pagination
              meta={query.data?.meta}
              onPage={(page) => update({ page })}
            />
          </div>
        </section>
      )}
    </div>
  )
}