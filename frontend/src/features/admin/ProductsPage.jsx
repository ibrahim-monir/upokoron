import { Fragment, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Archive,
  CheckCircle2,
  Download,
  History,
  ImageOff,
  Package,
  Plus,
  Search,
  SlidersHorizontal,
  Sparkles,
  Star,
  TrendingDown,
  X,
  XCircle,
} from 'lucide-react'
import { useList, useWrite } from './useResource'
import { AdjustStockForm, StockMovements } from './StockPanels'
import { api, get } from '../../lib/api'
import { cx, date, money, quantity } from '../../lib/format'
import { useAuthStore } from '../../stores/authStore'
import { Button, EmptyState, ErrorState, Input, Pagination, Select, Spinner, TableWrap, Td, Th, useToast } from '../../components/ui'


/* -------------------------------------------------------
   Stock cell
------------------------------------------------------- */

/* -------------------------------------------------------
   Per-SKU drill-down
------------------------------------------------------- */

/**
 * The rows an expanded product opens into: one per SKU.
 *
 * This is the old inventory table, scoped to a single product and shown
 * where the product is. The product row sums its variations, which is the
 * right answer for a simple product and a summary for a variable one --
 * "42 in stock" across four sizes does not tell you the mediums are gone.
 *
 * The query key starts with `admin.inventory` so that recording an
 * adjustment, which invalidates that key, refreshes these rows too.
 */
function VariationStockRows({ product, colSpan, canAdjust, onAdjust, onHistory }) {
  const query = useQuery({
    queryKey: ['admin.inventory', 'by-product', product.id],
    queryFn: () => get('/admin/inventory', { params: { product_id: product.id, per_page: 100 } }),
    staleTime: 30_000,
  })

  const rows = query.data?.data ?? []

  return (
    <tr>
      <td colSpan={colSpan} className="border-b border-slate-100 bg-slate-50/70 p-0">
        {query.isLoading ? (
          <div className="grid place-items-center py-6">
            <Spinner />
          </div>
        ) : rows.length === 0 ? (
          <p className="px-6 py-5 text-xs text-slate-500">
            No stock lines for this product yet. They appear as soon as stock counting is on.
          </p>
        ) : (
          <div className="scroll-x px-4 py-3">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="text-[10px] uppercase tracking-[0.08em] text-slate-400">
                  <th scope="col" className="py-1.5 text-left font-bold">
                    SKU
                  </th>
                  <th scope="col" className="py-1.5 text-right font-bold">
                    On hand
                  </th>
                  <th scope="col" className="py-1.5 text-right font-bold">
                    Reserved
                  </th>
                  <th scope="col" className="py-1.5 text-right font-bold">
                    Available
                  </th>
                  <th scope="col" className="py-1.5 text-right font-bold">
                    Avg cost
                  </th>
                  <th scope="col" className="py-1.5 text-right font-bold">
                    Value
                  </th>
                  <th scope="col" className="py-1.5 text-right font-bold">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-200/70">
                {rows.map((row) => (
                  <tr key={row.product_variation_id}>
                    <td className="py-2">
                      <p className="text-xs font-semibold text-slate-800">{row.sku}</p>
                      {row.variation && (
                        <p className="text-[11px] text-slate-400">{row.variation}</p>
                      )}
                    </td>

                    <td className="py-2 text-right text-xs text-slate-700 tabular">
                      {quantity(row.quantity)}
                    </td>

                    <td className="py-2 text-right text-xs text-slate-500 tabular">
                      {quantity(row.reserved_quantity)}
                    </td>

                    <td
                      className={cx(
                        'py-2 text-right text-xs font-semibold tabular',
                        row.is_out
                          ? 'text-danger-700'
                          : row.is_low
                            ? 'text-warning-700'
                            : 'text-slate-900',
                      )}
                    >
                      {quantity(row.available_quantity)}
                    </td>

                    <td className="py-2 text-right text-xs text-slate-600 tabular">
                      {money(row.average_cost)}
                    </td>

                    <td className="py-2 text-right text-xs font-medium text-slate-900 tabular">
                      {money(row.stock_value)}
                    </td>

                    <td className="py-2 text-right">
                      <div className="flex justify-end gap-1">
                        {canAdjust && (
                          <button
                            type="button"
                            onClick={() => onAdjust(row)}
                            className="rounded-md px-2 py-1 text-[11px] font-semibold text-brand-700 hover:bg-brand-50"
                          >
                            Adjust
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => onHistory(row)}
                          title="Stock movements"
                          className="grid h-6 w-6 place-items-center rounded-md text-slate-400 hover:bg-slate-200 hover:text-slate-700"
                        >
                          <History className="h-3.5 w-3.5" />
                          <span className="sr-only">Movements for {row.sku}</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </td>
    </tr>
  )
}


/* -------------------------------------------------------
   Page
------------------------------------------------------- */

export default function ProductsPage() {
  const can = useAuthStore((state) => state.can)
  const navigate = useNavigate()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [params, setParams] = useSearchParams()
  const [search, setSearch] = useState(params.get('search') ?? '')
  const [selected, setSelected] = useState(new Set())
  const [expanded, setExpanded] = useState(new Set())
  const [adjusting, setAdjusting] = useState(null)
  const [viewing, setViewing] = useState(null)

  const seesStock = can('inventory.view')
  const canAdjust = can('inventory.adjust')

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

  /*
   * Catalogue-wide stock totals, which the paginated list cannot give: the
   * rows on screen are one page of twenty. `per_page=1` buys the summary
   * block for a single row of payload rather than a second full listing.
   */
  const stockSummary = useQuery({
    queryKey: ['admin.inventory', 'summary'],
    queryFn: () => get('/admin/inventory', { params: { per_page: 1 } }),
    select: (response) => response.summary,
    enabled: seesStock,
    staleTime: 60_000,
  })

  const remove = useWrite('admin.products')

  /*
   * Copy, then go straight to the copy's edit form.
   *
   * Nobody duplicates a product in order to have two of it. They duplicate it
   * to make the next one, so the useful end of the action is the form with
   * the fields already filled in -- not a fresh row in the list they then
   * have to find and open.
   */
  const duplicate = useWrite('admin.products', {
    onSuccess: (data) => navigate(`/admin/products/${data?.product?.id}/edit`),
  })
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
    setExpanded(new Set())
  }, [filterKey])

  const toggle = (id) => {
    setSelected((previous) => {
      const next = new Set(previous)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const toggleExpanded = (id) => {
    setExpanded((previous) => {
      const next = new Set(previous)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  /* A movement changes stock totals on the product rows, not just the SKU. */
  const afterStockChange = () => {
    setAdjusting(null)
    queryClient.invalidateQueries({ queryKey: ['admin.products'] })
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

  /*
   * The overview reads across the whole catalogue where it can. Product
   * status is counted off the page on screen, because the list endpoint does
   * not carry a status breakdown; the stock figures come from the summary,
   * which does cover everything. The labels say which is which.
   */
  const stats = useMemo(() => {
    const summary = stockSummary.data

    const base = [
      {
        label: 'All products',
        value: total.toLocaleString(),
        icon: Package,
        tone: 'text-slate-700 bg-slate-100',
      },
    ]

    if (!seesStock) {
      return [
        ...base,
        {
          label: 'Active on this page',
          value: products.filter((p) => p.status === 'active').length,
          icon: CheckCircle2,
          tone: 'text-emerald-700 bg-emerald-50',
        },
        {
          label: 'Draft on this page',
          value: products.filter((p) => p.status === 'draft').length,
          icon: Sparkles,
          tone: 'text-amber-700 bg-amber-50',
        },
        {
          label: 'Archived on this page',
          value: products.filter((p) => p.status === 'archived').length,
          icon: Archive,
          tone: 'text-slate-600 bg-slate-100',
        },
      ]
    }

    return [
      ...base,
      {
        label: 'Stock value',
        value: summary ? money(summary.stock_value, { decimals: 0 }) : '—',
        icon: Package,
        tone: 'text-emerald-700 bg-emerald-50',
      },
      {
        label: 'Running low',
        value: summary ? summary.low_stock : '—',
        icon: TrendingDown,
        tone: summary?.low_stock > 0 ? 'text-amber-700 bg-amber-50' : 'text-slate-600 bg-slate-100',
        href: '/admin/products?stock=low',
      },
      {
        label: 'Out of stock',
        value: summary ? summary.out_of_stock : '—',
        icon: XCircle,
        tone: summary?.out_of_stock > 0 ? 'text-rose-700 bg-rose-50' : 'text-slate-600 bg-slate-100',
        href: '/admin/products?stock=out',
      },
    ]
  }, [products, total, seesStock, stockSummary.data])

  const hasFilters = [...params.keys()].some((key) => key !== 'page')

  // checkbox + product + category + type + variations + price + status +
  // actions, plus the two stock columns when they are shown.
  const columnCount = seesStock ? 10 : 9

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-5">
      {/* Header */}
      <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-medium text-slate-400">
            <span>Catalogue</span>
            <span>/</span>
            <span className="text-slate-600">Products &amp; stock</span>
          </div>

          <h1 className="text-2xl font-bold tracking-tight text-slate-950">Products &amp; stock</h1>
          <p className="mt-1 text-sm text-slate-500">
            {seesStock
              ? 'What you sell and what is on the shelf, in one list. Expand a product for its SKUs.'
              : 'Manage your catalogue and product status.'}
          </p>
        </div>

        {can('products.create') && (
          <div className="flex shrink-0 gap-2">
            <Button
              variant="secondary"
              onClick={() => navigate('/admin/products/import')}
              className="h-10"
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              Import
            </Button>

            <Button onClick={() => navigate('/admin/products/new')} className="h-10">
              <Plus className="h-4 w-4" aria-hidden="true" />
              Add product
            </Button>
          </div>
        )}
      </section>

      {/* Overview */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map(({ label, value, icon: Icon, tone, href }) => {
          const card = (
            <div
              className={cx(
                'h-full rounded-xl border border-slate-200 bg-white p-4 shadow-sm',
                href && 'transition hover:border-slate-300 hover:shadow-md',
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium text-slate-500">{label}</p>
                  <p className="mt-1 text-xl font-bold tracking-tight text-slate-950">{value}</p>
                </div>
                <span className={cx('grid h-9 w-9 shrink-0 place-items-center rounded-lg', tone)}>
                  <Icon className="h-4 w-4" />
                </span>
              </div>
            </div>
          )

          return href ? (
            <Link key={label} to={href} className="block">
              {card}
            </Link>
          ) : (
            <div key={label}>{card}</div>
          )
        })}
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

      {/* Stock panels, opened from a SKU row */}
      {adjusting && <AdjustStockForm row={adjusting} onDone={afterStockChange} />}
      {viewing && <StockMovements row={viewing} onClose={() => setViewing(null)} />}

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
                      className="h-4 w-4 rounded border-slate-300 text-brand-800"
                    />
                  </Th>
                  <Th className="w-14" />
                  <Th>Name</Th>
                  <Th>SKU</Th>
                  {seesStock && <Th>Stock</Th>}
                  <Th numeric>Price</Th>
                  <Th>Categories</Th>
                  <Th>Brand</Th>
                  <Th className="w-10" />
                  <Th>Date</Th>
                </tr>
              </thead>

              <tbody>
                {products.map((product) => {
                  const isOpen = expanded.has(product.id)
                  const canExpand = seesStock && product.stock?.tracked

                  return (
                    <Fragment key={product.id}>
                      <tr
                        className={cx(
                          'group border-t border-slate-100 transition-colors hover:bg-slate-50/70',
                          selected.has(product.id) && 'bg-brand-50/50',
                          isOpen && 'bg-slate-50/70',
                        )}
                      >
                        <Td>
                          <input
                            type="checkbox"
                            checked={selected.has(product.id)}
                            onChange={() => toggle(product.id)}
                            aria-label={`Select ${product.name}`}
                            className="h-4 w-4 rounded border-slate-300 text-brand-800"
                          />
                        </Td>

                        <Td>
                          <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded border border-slate-200 bg-slate-50">
                            {product.primary_image ? (
                              <img src={product.primary_image} alt="" className="h-full w-full object-cover" />
                            ) : (
                              <ImageOff className="h-4 w-4 text-slate-400" />
                            )}
                          </span>
                        </Td>

                        <Td>
                          <div className="min-w-[220px]">
                            <Link
                              to={`/admin/products/${product.id}/edit`}
                              className="text-sm font-semibold text-brand-800 hover:underline"
                            >
                              {product.name}
                            </Link>

                            {product.status !== 'active' && (
                              <span className="ml-1.5 text-sm text-slate-500">
                                &mdash; {product.status_label ?? product.status}
                              </span>
                            )}

                            {/*
                               The row actions appear on hover, the way every list
                               of this kind does it. They stay in the DOM so the
                               keyboard still reaches them; only the eye loses them
                               until the row is under the cursor.
                            */}
                            <div className="mt-0.5 flex flex-wrap items-center gap-1 text-[11px] text-slate-500 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                              <span>ID: {product.id}</span>

                              <span aria-hidden="true">|</span>
                              <Link
                                to={`/admin/products/${product.id}/edit`}
                                className="text-brand-700 hover:text-brand-900 hover:underline"
                              >
                                Edit
                              </Link>

                              {canExpand && seesStock && (
                                <>
                                  <span aria-hidden="true">|</span>
                                  <button
                                    type="button"
                                    onClick={() => toggleExpanded(product.id)}
                                    className="text-brand-700 hover:text-brand-900 hover:underline"
                                  >
                                    {isOpen ? 'Hide stock' : 'Stock'}
                                  </button>
                                </>
                              )}

                              {can('products.create') && (
                                <>
                                  <span aria-hidden="true">|</span>
                                  <button
                                    type="button"
                                    disabled={duplicate.isPending}
                                    onClick={() =>
                                      duplicate.mutate({
                                        url: `/admin/products/${product.id}/duplicate`,
                                      })
                                    }
                                    className="text-brand-700 hover:text-brand-900 hover:underline disabled:opacity-50"
                                  >
                                    Duplicate
                                  </button>
                                </>
                              )}

                              {product.status === 'active' && (
                                <>
                                  <span aria-hidden="true">|</span>
                                  <a
                                    href={`/products/${product.slug}`}
                                    target="_blank"
                                    rel="noreferrer noopener"
                                    className="text-brand-700 hover:text-brand-900 hover:underline"
                                  >
                                    Preview
                                  </a>
                                </>
                              )}

                              {can('products.delete') && (
                                <>
                                  <span aria-hidden="true">|</span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (!window.confirm(`Delete ${product.name}?`)) return

                                      remove.mutate({
                                        method: 'delete',
                                        url: `/admin/products/${product.id}`,
                                      })
                                    }}
                                    className="text-danger-700 hover:text-danger-900 hover:underline"
                                  >
                                    Trash
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                        </Td>

                        <Td>
                          <span className="whitespace-nowrap text-xs text-slate-600">
                            {product.default_variation?.sku ?? '-'}
                          </span>
                        </Td>

                        {seesStock && (
                          <Td>
                            {product.default_variation?.in_stock ? (
                              <span className="whitespace-nowrap text-xs font-semibold text-accent-700">
                                In stock
                                <span className="ml-1 font-normal text-slate-500">
                                  ({quantity(product.default_variation?.available_quantity)})
                                </span>
                              </span>
                            ) : (
                              <span className="whitespace-nowrap text-xs font-semibold text-danger-700">
                                Out of stock
                                <span className="ml-1 font-normal text-slate-500">(0)</span>
                              </span>
                            )}
                          </Td>
                        )}

                        <Td numeric>
                          <span className="tabular text-sm font-semibold text-slate-900">
                            {money(product.default_variation?.selling_price ?? 0)}
                          </span>
                        </Td>

                        <Td>
                          <span className="flex flex-wrap gap-x-1 gap-y-0.5 text-xs text-slate-600">
                            {(product.categories ?? []).length === 0
                              ? 'Uncategorized'
                              : (product.categories ?? []).map((category, index) => (
                                  <Link
                                    key={category.id}
                                    to={`/admin/products?category=${category.slug}`}
                                    className="text-brand-700 hover:underline"
                                  >
                                    {category.name}
                                    {index < (product.categories ?? []).length - 1 && ','}
                                  </Link>
                                ))}
                          </span>
                        </Td>

                        <Td>
                          <span className="whitespace-nowrap text-xs text-slate-600">
                            {product.brand?.name ?? '-'}
                          </span>
                        </Td>

                        <Td>
                          <Star
                            className={
                              product.is_featured
                                ? 'h-4 w-4 fill-warning-500 text-warning-500'
                                : 'h-4 w-4 text-slate-300'
                            }
                            aria-label={product.is_featured ? 'Featured' : 'Not featured'}
                          />
                        </Td>

                        <Td>
                          <span className="block whitespace-nowrap text-[11px] text-slate-500">
                            {product.status === 'active' ? 'Published' : 'Last modified'}
                          </span>
                          <span className="block whitespace-nowrap text-xs text-slate-700">
                            {date(
                              product.status === 'active'
                                ? product.published_at ?? product.created_at
                                : product.updated_at ?? product.created_at,
                            )}
                          </span>
                        </Td>
                      </tr>

                      {isOpen && (
                        <VariationStockRows
                          product={product}
                          colSpan={columnCount}
                          canAdjust={canAdjust}
                          onAdjust={(row) => {
                            setViewing(null)
                            setAdjusting(row)
                          }}
                          onHistory={(row) => {
                            setAdjusting(null)
                            setViewing(row)
                          }}
                        />
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </TableWrap>
          </div>

          <div className="border-t border-slate-100 px-4 py-3">
            <Pagination meta={query.data?.meta} onPage={(page) => update({ page })} />
          </div>
        </section>
      )}
    </div>
  )
}
