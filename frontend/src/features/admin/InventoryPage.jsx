import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Boxes, Search, SlidersHorizontal } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { get } from '../../lib/api'
import { useList, useWrite } from './useResource'
import { cx, dateTime, money, quantity } from '../../lib/format'
import { useAuthStore } from '../../stores/authStore'
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Pagination,
  Select,
  Spinner,
  TableWrap,
  Td,
  Th,
  Textarea,
} from '../../components/ui'

const FILTERS = [
  { value: '', label: 'All items' },
  { value: 'in', label: 'In stock' },
  { value: 'low', label: 'Low stock' },
  { value: 'out', label: 'Out of stock' },
]

function AdjustForm({ row, onDone }) {
  const write = useWrite('admin.inventory', { onSuccess: onDone })
  // A row with no id yet came from the "new item" picker -- it has never
  // had a movement, so opening stock is almost certainly what's wanted.
  const [type, setType] = useState(row.id ? 'adjustment' : 'opening')

  const submit = (event) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)

    write.mutate({
      url: '/admin/inventory/adjust',
      body: {
        product_variation_id: row.product_variation_id,
        quantity: data.get('quantity'),
        type,
        direction: type === 'opening' ? undefined : data.get('direction'),
        unit_cost: data.get('unit_cost') || null,
        note: data.get('note') || null,
      },
    })
  }

  return (
    <Card>
      <CardHeader
        title={`Adjust stock — ${row.sku}`}
        description="Every adjustment writes a stock movement and a journal entry, so the value always lands somewhere."
      />

      <form onSubmit={submit} className="grid gap-4 p-4 sm:grid-cols-2">
        <Field label="Reason">
          {({ id }) => (
            <Select id={id} value={type} onChange={(event) => setType(event.target.value)}>
              <option value="adjustment">Correction after a recount</option>
              <option value="damage">Damage</option>
              <option value="lost">Lost</option>
              <option value="found">Found</option>
              <option value="opening">Opening stock</option>
            </Select>
          )}
        </Field>

        {type !== 'opening' && (
          <Field label="Direction">
            {({ id }) => (
              <Select id={id} name="direction" defaultValue={type === 'found' ? 'in' : 'out'}>
                <option value="in">Stock in (increase)</option>
                <option value="out">Stock out (decrease)</option>
              </Select>
            )}
          </Field>
        )}

        <Field label="Quantity" name="quantity" type="number" step="0.001" min="0.001" required />

        <Field
          label="Unit cost"
          name="unit_cost"
          type="number"
          step="0.000001"
          min="0"
          hint={
            type === 'opening'
              ? 'What each unit cost you.'
              : 'Leave blank to use the current average cost.'
          }
        />

        <Field label="Note" className="sm:col-span-2">
          {({ id }) => <Textarea id={id} name="note" rows={2} placeholder="What happened?" />}
        </Field>

        <div className="flex gap-2 sm:col-span-2">
          <Button type="submit" loading={write.isPending}>
            Record adjustment
          </Button>
          <Button variant="secondary" onClick={onDone}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  )
}

/**
 * A product with no stock movement yet has no row in `inventories`, so it
 * never appears in the list above -- there is nothing to click "Adjust" on.
 * This searches the catalogue directly and hands back a variation, which is
 * all AdjustForm actually needs.
 */
function NewItemPicker({ onPick, onCancel }) {
  const [search, setSearch] = useState('')
  const [product, setProduct] = useState(null)

  const results = useQuery({
    queryKey: ['admin', 'products', 'stock-picker', search],
    queryFn: () => get('/admin/products', { params: { search, per_page: 10 } }),
    enabled: search.trim().length > 1,
  })

  const detail = useQuery({
    queryKey: ['admin', 'products', 'stock-picker-detail', product?.id],
    queryFn: () => get(`/admin/products/${product.id}`),
    enabled: product != null,
  })

  const variations = detail.data?.product?.variations ?? []

  return (
    <Card>
      <CardHeader
        title="Add a new item to inventory"
        description="Search for a product that has never had stock, then pick which variation to open a balance for."
      />

      <div className="flex flex-col gap-3 p-4">
        {!product ? (
          <>
            <Input
              autoFocus
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by product name or SKU"
              aria-label="Search products"
            />

            {results.isFetching && <Spinner />}

            {search.trim().length > 1 && !results.isFetching && (results.data?.data ?? []).length === 0 && (
              <p className="text-sm text-ink-500">No products match.</p>
            )}

            <ul className="divide-y divide-ink-100">
              {(results.data?.data ?? []).map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => setProduct(item)}
                    className="flex w-full items-center justify-between gap-3 p-2.5 text-left hover:bg-ink-50"
                  >
                    <span className="text-sm font-medium text-ink-900">{item.name}</span>
                    <span className="text-xs text-ink-500">
                      {item.variations_count} variation{item.variations_count === 1 ? '' : 's'}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        ) : detail.isLoading ? (
          <Spinner />
        ) : (
          <>
            <p className="text-sm text-ink-600">
              Pick the variation to stock for <span className="font-medium text-ink-900">{product.name}</span>:
            </p>

            <ul className="divide-y divide-ink-100">
              {variations.map((v) => (
                <li key={v.id}>
                  <button
                    type="button"
                    onClick={() => onPick({ product_variation_id: v.id, sku: v.sku })}
                    className="flex w-full items-center justify-between gap-3 p-2.5 text-left hover:bg-ink-50"
                  >
                    <span className="text-sm font-medium text-ink-900">{v.name || product.name}</span>
                    <span className="text-xs text-ink-500">{v.sku}</span>
                  </button>
                </li>
              ))}
            </ul>

            <Button variant="secondary" size="sm" onClick={() => setProduct(null)} className="self-start">
              Back to search
            </Button>
          </>
        )}

        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </Card>
  )
}

function Movements({ row, onClose }) {
  const query = useQuery({
    queryKey: ['admin', 'inventory', 'movements', row.product_variation_id],
    queryFn: () => get(`/admin/inventory/${row.product_variation_id}/movements`),
  })

  return (
    <Card>
      <CardHeader
        title={`Stock movements — ${row.sku}`}
        description="Newest first. The running quantity and value after each movement."
        actions={
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        }
      />

      {query.isLoading ? (
        <div className="grid place-items-center p-10">
          <Spinner />
        </div>
      ) : (
        <div className="scroll-x">
          <table className="w-full min-w-max text-sm">
            <thead>
              <tr>
                <Th>When</Th>
                <Th>Type</Th>
                <Th numeric>Qty</Th>
                <Th numeric>Unit cost</Th>
                <Th numeric>Total cost</Th>
                <Th numeric>Qty after</Th>
                <Th numeric>Avg after</Th>
                <Th>Entry</Th>
              </tr>
            </thead>
            <tbody>
              {(query.data?.data ?? []).map((movement) => (
                <tr key={movement.id}>
                  <Td>{dateTime(movement.transacted_at)}</Td>
                  <Td>
                    <Badge tone={movement.direction === 'in' ? 'success' : 'warning'}>
                      {movement.type_label}
                    </Badge>
                  </Td>
                  <Td numeric>
                    {movement.direction === 'in' ? '+' : '−'}
                    {quantity(movement.quantity)}
                  </Td>
                  <Td numeric>{money(movement.unit_cost)}</Td>
                  <Td numeric>{money(movement.total_cost)}</Td>
                  <Td numeric>{quantity(movement.quantity_after)}</Td>
                  <Td numeric>{money(movement.average_cost_after)}</Td>
                  <Td className="text-xs text-ink-500">{movement.journal_entry ?? '—'}</Td>
                </tr>
              ))}
            </tbody>
          </table>

          {(query.data?.data ?? []).length === 0 && (
            <EmptyState title="No movements yet" description="Nothing has moved for this item." />
          )}
        </div>
      )}
    </Card>
  )
}

export default function InventoryPage() {
  const can = useAuthStore((state) => state.can)
  const [params, setParams] = useSearchParams()
  const [search, setSearch] = useState(params.get('search') ?? '')
  const [adjusting, setAdjusting] = useState(null)
  const [viewing, setViewing] = useState(null)
  const [picking, setPicking] = useState(false)

  const query = useList('admin.inventory', '/admin/inventory', {
    search: params.get('search') || undefined,
    filter: params.get('filter') || undefined,
    page: Number(params.get('page') ?? 1),
  })

  const update = (patch) => {
    const next = new URLSearchParams(params)

    Object.entries(patch).forEach(([key, value]) => {
      if (!value) next.delete(key)
      else next.set(key, String(value))
    })

    if (!('page' in patch)) next.delete('page')
    setParams(next)
  }

  const rows = query.data?.data ?? []
  const summary = query.data?.summary

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-ink-900">Inventory</h1>
        <p className="mt-0.5 text-sm text-ink-500">
          Costed by weighted average. Every movement posts to the ledger.
        </p>
      </div>

      {summary && (
        <div className="grid gap-3 sm:grid-cols-4">
          {[
            { label: 'Stock value', value: money(summary.stock_value), tone: 'neutral' },
            { label: 'Tracked items', value: summary.tracked_items, tone: 'neutral' },
            { label: 'Low stock', value: summary.low_stock, tone: summary.low_stock > 0 ? 'warn' : 'neutral' },
            { label: 'Out of stock', value: summary.out_of_stock, tone: summary.out_of_stock > 0 ? 'bad' : 'neutral' },
          ].map((tile) => (
            <Card key={tile.label} className="p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-ink-500">{tile.label}</p>
              <p
                className={cx(
                  'tabular mt-1 text-xl font-semibold',
                  tile.tone === 'warn' && 'text-warning-700',
                  tile.tone === 'bad' && 'text-danger-700',
                  tile.tone === 'neutral' && 'text-ink-900',
                )}
              >
                {tile.value}
              </p>
            </Card>
          ))}
        </div>
      )}

      {adjusting && <AdjustForm row={adjusting} onDone={() => setAdjusting(null)} />}
      {viewing && <Movements row={viewing} onClose={() => setViewing(null)} />}
      {picking && (
        <NewItemPicker
          onPick={(row) => {
            setPicking(false)
            setAdjusting(row)
          }}
          onCancel={() => setPicking(false)}
        />
      )}

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
            placeholder="Search by product or SKU"
            aria-label="Search inventory"
            className="pl-9"
          />
        </form>

        <Select
          value={params.get('filter') ?? ''}
          onChange={(event) => update({ filter: event.target.value })}
          aria-label="Filter stock"
          className="w-44"
        >
          {FILTERS.map((filter) => (
            <option key={filter.value} value={filter.value}>
              {filter.label}
            </option>
          ))}
        </Select>

        {can('inventory.opening') && (
          <Button variant="secondary" onClick={() => setPicking(true)}>
            New item
          </Button>
        )}
      </div>

      {query.isError && <ErrorState error={query.error} onRetry={query.refetch} />}

      {query.isLoading ? (
        <div className="grid place-items-center py-16">
          <Spinner />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Boxes}
          title="Nothing in stock yet"
          description="Stock appears once a product has had an opening balance or a purchase."
          action={
            can('inventory.opening') && (
              <Button onClick={() => setPicking(true)}>Add opening stock</Button>
            )
          }
        />
      ) : (
        <>
          <TableWrap>
            <thead>
              <tr>
                <Th>Item</Th>
                <Th numeric>On hand</Th>
                <Th numeric>Reserved</Th>
                <Th numeric>Available</Th>
                <Th numeric>Avg cost</Th>
                <Th numeric>Stock value</Th>
                <Th>Last moved</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="hover:bg-ink-50">
                  <Td>
                    <p className="font-medium text-ink-900">{row.product}</p>
                    <p className="text-xs text-ink-500">
                      {row.sku}
                      {row.variation ? ` · ${row.variation}` : ''}
                    </p>
                  </Td>
                  <Td numeric>{quantity(row.quantity)}</Td>
                  <Td numeric className={Number(row.reserved_quantity) > 0 ? 'text-warning-700' : undefined}>
                    {quantity(row.reserved_quantity)}
                  </Td>
                  <Td numeric>
                    <span className="inline-flex items-center gap-1.5">
                      {quantity(row.available_quantity)}
                      {row.is_out ? (
                        <Badge tone="danger">Out</Badge>
                      ) : row.is_low ? (
                        <Badge tone="warning">Low</Badge>
                      ) : null}
                    </span>
                  </Td>
                  <Td numeric>{money(row.average_cost)}</Td>
                  <Td numeric className="font-medium">{money(row.stock_value)}</Td>
                  <Td className="text-xs text-ink-500">{dateTime(row.last_movement_at)}</Td>
                  <Td className="text-right">
                    <div className="flex justify-end gap-3">
                      <button
                        type="button"
                        onClick={() => setViewing(row)}
                        className="text-sm font-medium text-brand-700 hover:underline"
                      >
                        History
                      </button>
                      {can('inventory.adjust') && (
                        <button
                          type="button"
                          onClick={() => setAdjusting(row)}
                          className="inline-flex items-center gap-1 text-sm font-medium text-ink-700 hover:underline"
                        >
                          <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
                          Adjust
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
