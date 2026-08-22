import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'

import { get } from '../../lib/api'
import { dateTime, money, quantity } from '../../lib/format'
import { useWrite } from './useResource'
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Field,
  Select,
  Spinner,
  Td,
  Textarea,
  Th,
} from '../../components/ui'

/*
 * The two stock panels, kept apart from any one page.
 *
 * They used to live inside the inventory screen. Stock is now managed from
 * the products table, and these are the parts of that screen worth keeping:
 * a form that moves stock, and the ledger that proves what moved.
 *
 * Both take a `row` in the shape `/admin/inventory` returns -- at minimum
 * `sku` and `product_variation_id`.
 */

export function AdjustStockForm({ row, onDone }) {
  const write = useWrite('admin.inventory', { onSuccess: onDone })
  // A row with no id yet has never had a movement, so opening stock is
  // almost certainly what's wanted.
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
        actions={
          <Button variant="ghost" size="sm" onClick={onDone}>
            Close
          </Button>
        }
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

export function StockMovements({ row, onClose }) {
  const query = useQuery({
    queryKey: ['admin', 'inventory', 'movements', row.product_variation_id],
    queryFn: () => get(`/admin/inventory/${row.product_variation_id}/movements`),
  })

  const movements = query.data?.data ?? []

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
              {movements.map((movement) => (
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

          {movements.length === 0 && (
            <EmptyState title="No movements yet" description="Nothing has moved for this item." />
          )}
        </div>
      )}
    </Card>
  )
}
