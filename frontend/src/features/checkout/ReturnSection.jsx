import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { RotateCcw } from 'lucide-react'
import { api } from '../../lib/api'
import { dateTime, money } from '../../lib/format'
import { useTranslation } from '../../lib/i18n'
import { Badge, Button, useToast } from '../../components/ui'

const RETURN_TONE = {
  requested: 'warning',
  approved: 'brand',
  received: 'brand',
  refunded: 'success',
  rejected: 'danger',
}

const REASON_KEYS = ['damaged', 'faulty', 'wrong_item', 'not_as_described', 'missing_parts', 'other']

/**
 * Returns on the customer's order page: what has been asked for already,
 * and -- while the window is open -- a form to send items back.
 *
 * The server decides what may come back (delivered, within the window,
 * no more than was bought less what is already on its way back), and sends
 * those figures with the order, so this form never offers more than it will
 * accept.
 */
export function ReturnSection({ order, phone }) {
  const { t } = useTranslation()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [quantities, setQuantities] = useState({})
  const [reason, setReason] = useState('')
  const [note, setNote] = useState('')

  const returnable = order.returnable_quantities ?? {}
  const items = (order.items ?? []).filter((item) => Number(returnable[item.id] ?? 0) > 0)
  const returns = order.returns ?? []

  const submit = useMutation({
    mutationFn: async () => {
      const { data } = await api.post(`/shop/orders/${order.number}/returns`, {
        phone: phone || undefined,
        reason,
        note: note || undefined,
        items: Object.entries(quantities)
          .filter(([, qty]) => Number(qty) > 0)
          .map(([id, qty]) => ({ order_item_id: Number(id), quantity: Number(qty) })),
      })

      return data
    },
    onSuccess(data) {
      toast.success(data?.message ?? t('returns.requested'))
      setOpen(false)
      setQuantities({})
      setReason('')
      setNote('')
      queryClient.invalidateQueries({ queryKey: ['shop', 'orders'] })
    },
    onError(error) {
      toast.error(error?.response?.data?.message ?? error?.message ?? t('returns.failed'))
    },
  })

  const chosen = Object.values(quantities).some((qty) => Number(qty) > 0)

  if (returns.length === 0 && !order.can_request_return) return null

  return (
    <div className="rounded-card border border-ink-200 bg-white p-4">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-ink-900">
        <RotateCcw className="h-4 w-4 text-brand-800" aria-hidden="true" />
        {t('returns.title')}
      </h2>

      {returns.length > 0 && (
        <ul className="mt-3 flex flex-col gap-2">
          {returns.map((row) => (
            <li key={row.number} className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-medium text-ink-900">{row.number}</span>
              <Badge tone={RETURN_TONE[row.status] ?? 'neutral'}>{t(`returns.status.${row.status}`)}</Badge>
              <span className="text-ink-500">{row.reason_label}</span>
              {row.status === 'refunded' && Number(row.refund_amount) > 0 && (
                <span className="text-ink-700">{money(row.refund_amount)}</span>
              )}
              <span className="ml-auto text-xs text-ink-500">{dateTime(row.requested_at)}</span>
            </li>
          ))}
        </ul>
      )}

      {order.can_request_return && !open && (
        <div className="mt-3">
          <p className="text-sm text-ink-600">
            {t('returns.windowOpen', { date: dateTime(order.returnable_until) })}
          </p>
          <Button variant="secondary" className="mt-2" onClick={() => setOpen(true)}>
            {t('returns.request')}
          </Button>
        </div>
      )}

      {order.can_request_return && open && (
        <form
          className="mt-3 flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault()

            if (chosen && reason) submit.mutate()
          }}
        >
          <p className="text-sm text-ink-600">{t('returns.chooseItems')}</p>

          <ul className="flex flex-col gap-2">
            {items.map((item) => {
              const max = Number(returnable[item.id])

              return (
                <li key={item.id} className="flex items-center gap-3 rounded-lg border border-ink-100 p-2">
                  <span className="min-w-0 flex-1 text-sm text-ink-800">
                    {item.product_name}
                    {item.variation_name ? ` — ${item.variation_name}` : ''}
                  </span>
                  <label className="flex items-center gap-2 text-xs text-ink-500">
                    {t('returns.quantity')}
                    <select
                      value={quantities[item.id] ?? 0}
                      onChange={(event) =>
                        setQuantities((previous) => ({ ...previous, [item.id]: event.target.value }))
                      }
                      className="h-9 rounded-lg border border-ink-300 px-2 text-sm text-ink-900"
                    >
                      {Array.from({ length: Math.floor(max) + 1 }, (_, n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </label>
                </li>
              )
            })}
          </ul>

          <label className="flex flex-col gap-1 text-sm text-ink-800">
            {t('returns.reason')}
            <select
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              required
              className="h-10 rounded-lg border border-ink-300 px-3"
            >
              <option value="">{t('returns.chooseReason')}</option>
              {REASON_KEYS.filter((key) => order.return_reasons?.[key]).map((key) => (
                <option key={key} value={key}>
                  {t(`returns.reasons.${key}`)}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm text-ink-800">
            {t('returns.note')}
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={3}
              maxLength={1000}
              placeholder={t('returns.notePlaceholder')}
              className="rounded-lg border border-ink-300 px-3 py-2"
            />
          </label>

          <p className="text-xs text-ink-500">{t('returns.conditions')}</p>

          <div className="flex gap-2">
            <Button type="submit" loading={submit.isPending} disabled={!chosen || !reason}>
              {t('returns.submit')}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              {t('returns.cancel')}
            </Button>
          </div>
        </form>
      )}
    </div>
  )
}
