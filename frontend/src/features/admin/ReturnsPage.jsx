import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { RotateCcw, X } from 'lucide-react'
import { api, get } from '../../lib/api'
import { cx, dateTime, money } from '../../lib/format'
import { useAuthStore } from '../../stores/authStore'
import { Badge, Button, EmptyState, ErrorState, Pagination, Spinner, useToast } from '../../components/ui'

const TABS = [
  { value: 'requested', label: 'New requests' },
  { value: 'approved', label: 'Waiting for goods' },
  { value: 'received', label: 'To refund' },
  { value: 'refunded', label: 'Refunded' },
  { value: 'rejected', label: 'Rejected' },
  { value: '', label: 'All' },
]

const TONE = { requested: 'warning', approved: 'brand', received: 'brand', refunded: 'success', rejected: 'danger' }

/*
 * One return, and whatever can be done to it next. Each step is one button:
 * a request is approved or rejected; an approved return is received, saying
 * per item whether it goes back on the shelf; a received one is refunded.
 */
function ReturnDialog({ id, onClose }) {
  const toast = useToast()
  const queryClient = useQueryClient()
  const can = useAuthStore((state) => state.can)
  const [restock, setRestock] = useState({})
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')

  const query = useQuery({
    queryKey: ['admin', 'returns', id],
    queryFn: () => get(`/admin/returns/${id}`),
    select: (response) => response.data,
  })

  const act = useMutation({
    mutationFn: ({ action, body }) => api.post(`/admin/returns/${id}/${action}`, body),
    onSuccess(response) {
      toast.success(response?.data?.message ?? 'Done.')
      queryClient.invalidateQueries({ queryKey: ['admin', 'returns'] })
      queryClient.invalidateQueries({ queryKey: ['admin', 'orders'] })
    },
    onError(error) {
      toast.error(error?.response?.data?.message ?? error?.message ?? 'That did not work.')
    },
  })

  const ret = query.data

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-ink-950/40" />

      <div
        role="dialog"
        aria-modal="true"
        className="rise relative flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
      >
        <header className="flex items-start gap-3 border-b border-ink-200 px-5 py-4">
          <div className="min-w-0 flex-1">
            <p className="font-bold text-ink-900">{ret?.number ?? 'Return'}</p>
            {ret && (
              <p className="mt-0.5 text-xs text-ink-500">
                Order{' '}
                <Link to={`/admin/orders/${ret.order.id}`} className="font-semibold text-brand-800 hover:underline">
                  {ret.order.number}
                </Link>{' '}
                · {ret.order.customer} · {ret.order.phone}
              </p>
            )}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="text-ink-400 hover:text-ink-900">
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {query.isLoading ? (
            <div className="grid place-items-center py-12">
              <Spinner />
            </div>
          ) : query.isError ? (
            <ErrorState error={query.error} onRetry={query.refetch} />
          ) : (
            <div className="flex flex-col gap-4 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={TONE[ret.status] ?? 'neutral'}>{ret.status_label}</Badge>
                <span className="text-ink-700">{ret.reason_label}</span>
                <span className="ml-auto text-xs text-ink-500">Requested {dateTime(ret.requested_at)}</span>
              </div>

              {ret.customer_note && (
                <p className="rounded-lg bg-ink-50 p-3 text-ink-700">“{ret.customer_note}”</p>
              )}

              <ul className="flex flex-col gap-2">
                {ret.items.map((item) => (
                  <li key={item.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-ink-100 p-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-ink-900">
                        {item.product_name}
                        {item.variation_name ? ` — ${item.variation_name}` : ''}
                      </p>
                      <p className="text-xs text-ink-500">
                        {item.sku} · {Number(item.quantity)} × {money(item.unit_price)}
                      </p>
                    </div>

                    {ret.status === 'approved' ? (
                      <label className="flex items-center gap-2 text-xs text-ink-700">
                        <input
                          type="checkbox"
                          checked={restock[item.id] ?? true}
                          onChange={(event) => setRestock((prev) => ({ ...prev, [item.id]: event.target.checked }))}
                          className="h-4 w-4 rounded border-ink-300"
                        />
                        Resellable — put back in stock
                      </label>
                    ) : item.restock !== null ? (
                      <span className={cx('text-xs font-semibold', item.restock ? 'text-success-700' : 'text-danger-700')}>
                        {item.restock ? 'Back in stock' : 'Damaged — written off'}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>

              {Number(ret.refund_amount) > 0 && (
                <p className="text-ink-700">
                  Refund due: <span className="font-semibold">{money(ret.refund_amount)}</span>
                  <span className="text-xs text-ink-500">
                    {' '}
                    (the items&apos; price, less their share of any coupon or points discount)
                  </span>
                </p>
              )}

              {ret.staff_note && <p className="text-xs text-ink-500">Staff note: {ret.staff_note}</p>}

              {['requested', 'approved'].includes(ret.status) && can('returns.manage') && (
                <textarea
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  rows={2}
                  placeholder="Note (optional) — for example, how the parcel will be collected"
                  className="rounded-lg border border-ink-300 px-3 py-2"
                />
              )}

              {ret.status === 'received' && can('returns.refund') && (
                <label className="flex flex-col gap-1 text-ink-800">
                  Refund amount
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                    placeholder={ret.refund_amount}
                    className="h-10 w-48 rounded-lg border border-ink-300 px-3"
                  />
                  <span className="text-xs text-ink-500">
                    Blank refunds the amount due. You can give more — the delivery charge, say — up to what was
                    paid. The customer must have paid (record the COD payment first).
                  </span>
                </label>
              )}
            </div>
          )}
        </div>

        {ret && (
          <footer className="flex flex-wrap gap-2 border-t border-ink-200 px-5 py-3">
            {ret.status === 'requested' && can('returns.manage') && (
              <>
                <Button loading={act.isPending} onClick={() => act.mutate({ action: 'approve', body: { note } })}>
                  Approve
                </Button>
                <Button
                  variant="secondary"
                  className="text-danger-700"
                  loading={act.isPending}
                  onClick={() => {
                    if (window.confirm(`Reject return ${ret.number}?`)) act.mutate({ action: 'reject', body: { note } })
                  }}
                >
                  Reject
                </Button>
              </>
            )}

            {ret.status === 'approved' && can('returns.manage') && (
              <Button
                loading={act.isPending}
                onClick={() => {
                  if (!window.confirm('Mark the goods as received? Ticked items go back into stock.')) return

                  act.mutate({
                    action: 'receive',
                    body: {
                      note,
                      items: ret.items.map((item) => ({ id: item.id, restock: restock[item.id] ?? true })),
                    },
                  })
                }}
              >
                Goods received
              </Button>
            )}

            {ret.status === 'received' && can('returns.refund') && (
              <Button
                loading={act.isPending}
                onClick={() => {
                  const give = amount || ret.refund_amount

                  if (window.confirm(`Refund ${money(give)} for ${ret.number}?`)) {
                    act.mutate({ action: 'refund', body: amount ? { amount: Number(amount) } : {} })
                  }
                }}
              >
                Refund
              </Button>
            )}

            <Button variant="secondary" onClick={onClose} className="ml-auto">
              Close
            </Button>
          </footer>
        )}
      </div>
    </div>
  )
}

export default function ReturnsPage() {
  const [status, setStatus] = useState('requested')
  const [page, setPage] = useState(1)
  const [openId, setOpenId] = useState(null)

  const query = useQuery({
    queryKey: ['admin', 'returns', { status, page }],
    queryFn: () => get('/admin/returns', { params: { status: status || undefined, page } }),
    placeholderData: (previous) => previous,
  })

  const rows = query.data?.data ?? []
  const counts = query.data?.counts ?? {}

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-ink-900">Returns</h1>
        <p className="mt-0.5 text-sm text-ink-500">
          Customers ask for returns from their order page, within the return window. Approve, receive the goods
          back into stock, then refund.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {TABS.map((tab) => (
          <button
            key={tab.value || 'all'}
            type="button"
            onClick={() => {
              setStatus(tab.value)
              setPage(1)
            }}
            className={cx(
              'rounded-full border px-3 py-1.5 text-sm font-medium',
              status === tab.value
                ? 'border-brand-600 bg-brand-600 text-white'
                : 'border-ink-200 bg-white text-ink-700 hover:bg-ink-50',
            )}
          >
            {tab.label}
            {tab.value && counts[tab.value] ? ` (${counts[tab.value]})` : ''}
          </button>
        ))}
      </div>

      {query.isError ? (
        <ErrorState error={query.error} onRetry={query.refetch} />
      ) : query.isLoading ? (
        <div className="grid place-items-center py-16">
          <Spinner />
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-ink-200 bg-white">
          <EmptyState icon={RotateCcw} title="Nothing here" description="Returns in this state will show up here." />
        </div>
      ) : (
        <ul className="flex flex-col divide-y divide-ink-100 rounded-2xl border border-ink-200 bg-white">
          {rows.map((row) => (
            <li key={row.id}>
              <button
                type="button"
                onClick={() => setOpenId(row.id)}
                className="flex w-full flex-wrap items-center gap-3 px-4 py-3 text-left text-sm hover:bg-ink-50"
              >
                <span className="font-semibold text-ink-900">{row.number}</span>
                <Badge tone={TONE[row.status] ?? 'neutral'}>{row.status_label}</Badge>
                <span className="text-ink-600">
                  Order {row.order.number} · {row.order.customer}
                </span>
                <span className="text-ink-500">{row.reason_label}</span>
                <span className="text-ink-500">
                  {row.item_count} item{row.item_count === 1 ? '' : 's'}
                </span>
                <span className="ml-auto text-xs text-ink-500">{dateTime(row.requested_at)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <Pagination meta={query.data?.meta} onPage={setPage} />

      {openId && <ReturnDialog id={openId} onClose={() => setOpenId(null)} />}
    </div>
  )
}
