import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Pencil, Plus, Tag, Trash2, X } from 'lucide-react'
import { api, get } from '../../lib/api'
import { cx, datetimeLocalValue, money } from '../../lib/format'
import { Badge, Button, ErrorState, Field, Select, Spinner, useToast } from '../../components/ui'
import { useAuthStore } from '../../stores/authStore'

/**
 * Discount codes.
 *
 * A coupon is worked out fresh against the live cart every time -- nothing
 * here is a cache of what it's worth. This screen just defines the rule; the
 * storefront's cart page is where a shopper actually redeems one.
 */

const TYPES = [
  { value: 'percentage', label: 'Percentage off' },
  { value: 'fixed', label: 'Fixed amount off' },
]

function useCoupons() {
  return useQuery({
    queryKey: ['admin', 'coupons'],
    queryFn: () => get('/admin/coupons'),
    select: (response) => response.data,
  })
}

function CouponForm({ coupon, onClose }) {
  const toast = useToast()
  const queryClient = useQueryClient()

  const [form, setForm] = useState({
    code: coupon?.code ?? '',
    name: coupon?.name ?? '',
    type: coupon?.type ?? 'percentage',
    value: coupon?.value ?? '10.00',
    max_discount_amount: coupon?.max_discount_amount ?? '',
    min_order_total: coupon?.min_order_total ?? '',
    usage_limit: coupon?.usage_limit ?? '',
    usage_limit_per_customer: coupon?.usage_limit_per_customer ?? '',
    starts_at: datetimeLocalValue(coupon?.starts_at),
    expires_at: datetimeLocalValue(coupon?.expires_at),
    is_active: coupon?.is_active ?? true,
  })

  const set = (key, value) => setForm((previous) => ({ ...previous, [key]: value }))

  const save = useMutation({
    mutationFn: async () => {
      const numberOrNull = (v) => (v === '' ? null : Number(v))

      const payload = {
        code: form.code.trim(),
        name: form.name.trim() || null,
        type: form.type,
        value: Number(form.value || 0),
        max_discount_amount: numberOrNull(form.max_discount_amount),
        min_order_total: numberOrNull(form.min_order_total),
        usage_limit: numberOrNull(form.usage_limit),
        usage_limit_per_customer: numberOrNull(form.usage_limit_per_customer),
        starts_at: form.starts_at || null,
        expires_at: form.expires_at || null,
        is_active: form.is_active,
      }

      const { data } = coupon
        ? await api.put(`/admin/coupons/${coupon.id}`, payload)
        : await api.post('/admin/coupons', payload)

      return data
    },
    onSuccess() {
      toast.success(coupon ? 'Coupon updated.' : 'Coupon added.')
      queryClient.invalidateQueries({ queryKey: ['admin', 'coupons'] })
      onClose()
    },
    onError(error) {
      toast.error(error?.message ?? 'Could not save that.')
    },
  })

  return (
    <div className="rounded-lg border border-ink-200 bg-ink-50 p-3">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-sm font-semibold text-ink-900">{coupon ? 'Edit coupon' : 'New coupon'}</h4>
        <button type="button" onClick={onClose} aria-label="Close" className="text-ink-500 hover:text-ink-800">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Field
          label="Code"
          hint="What the customer types. Stored in caps."
          value={form.code}
          onChange={(event) => set('code', event.target.value)}
        />

        <Field
          label="Internal name (optional)"
          hint="Shown only in this list."
          value={form.name}
          onChange={(event) => set('name', event.target.value)}
        />

        <Field label="Type">
          {({ id }) => (
            <Select id={id} value={form.type} onChange={(event) => set('type', event.target.value)}>
              {TYPES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          )}
        </Field>

        <Field
          label={form.type === 'percentage' ? 'Percentage (0-100)' : 'Amount'}
          type="number"
          step="0.01"
          min="0"
          max={form.type === 'percentage' ? '100' : undefined}
          value={form.value}
          onChange={(event) => set('value', event.target.value)}
        />

        {form.type === 'percentage' && (
          <Field
            label="Max discount (optional)"
            type="number"
            step="0.01"
            min="0"
            placeholder="No cap"
            hint="Caps the discount so a large order doesn't take an outsized cut."
            value={form.max_discount_amount}
            onChange={(event) => set('max_discount_amount', event.target.value)}
          />
        )}

        <Field
          label="Minimum order (optional)"
          type="number"
          step="0.01"
          min="0"
          placeholder="No minimum"
          value={form.min_order_total}
          onChange={(event) => set('min_order_total', event.target.value)}
        />

        <Field
          label="Total uses allowed (optional)"
          type="number"
          min="1"
          placeholder="Unlimited"
          value={form.usage_limit}
          onChange={(event) => set('usage_limit', event.target.value)}
        />

        <Field
          label="Uses per customer (optional)"
          type="number"
          min="1"
          placeholder="Unlimited"
          value={form.usage_limit_per_customer}
          onChange={(event) => set('usage_limit_per_customer', event.target.value)}
        />

        <Field label="Starts (optional)" type="datetime-local" value={form.starts_at} onChange={(event) => set('starts_at', event.target.value)} />
        <Field label="Expires (optional)" type="datetime-local" value={form.expires_at} onChange={(event) => set('expires_at', event.target.value)} />
      </div>

      <label className="mt-3 flex items-center gap-2 text-sm text-ink-800">
        <input
          type="checkbox"
          checked={form.is_active}
          onChange={(event) => set('is_active', event.target.checked)}
          className="h-4 w-4 rounded border-ink-300 text-brand-800"
        />
        Active
      </label>

      <div className="mt-3 flex gap-2">
        <Button
          onClick={() => save.mutate()}
          loading={save.isPending}
          disabled={!form.code.trim() || !form.value}
        >
          Save
        </Button>
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </div>
  )
}

function CouponRow({ coupon, editable, editing, onEdit, onCloseEdit }) {
  const toast = useToast()
  const queryClient = useQueryClient()

  const remove = useMutation({
    mutationFn: () => api.delete(`/admin/coupons/${coupon.id}`),
    onSuccess() {
      toast.success('Coupon removed.')
      queryClient.invalidateQueries({ queryKey: ['admin', 'coupons'] })
    },
    onError(error) {
      toast.error(error?.message ?? 'Could not remove that.')
    },
  })

  if (editing) {
    return <CouponForm coupon={coupon} onClose={onCloseEdit} />
  }

  const value = coupon.type === 'percentage' ? `${Number(coupon.value)}%` : money(coupon.value)
  const used = coupon.usage_limit ? `${coupon.used_count} / ${coupon.usage_limit} used` : `${coupon.used_count} used`

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-ink-100 px-3 py-2.5">
      <Tag className="h-4 w-4 shrink-0 text-ink-400" aria-hidden="true" />

      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-ink-900">
          {coupon.code}
          <Badge tone="neutral">{value} off</Badge>
          {!coupon.is_active && <Badge tone="neutral">Off</Badge>}
          {coupon.is_active && !coupon.is_within_window && <Badge tone="warning">Out of window</Badge>}
        </p>
        <p className="text-xs text-ink-500">
          {coupon.name && `${coupon.name} · `}
          {used}
          {coupon.min_order_total && ` · min ${money(coupon.min_order_total)}`}
          {coupon.max_discount_amount && ` · capped at ${money(coupon.max_discount_amount)}`}
        </p>
      </div>

      {editable && (
        <div className="flex shrink-0 gap-1">
          <button
            type="button"
            onClick={onEdit}
            aria-label={`Edit ${coupon.code}`}
            className="grid h-7 w-7 place-items-center rounded text-ink-500 hover:bg-ink-100 hover:text-ink-800"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => {
              if (window.confirm(`Remove "${coupon.code}"? This cannot be undone.`)) {
                remove.mutate()
              }
            }}
            aria-label={`Remove ${coupon.code}`}
            className="grid h-7 w-7 place-items-center rounded text-ink-500 hover:bg-ink-100 hover:text-danger-700"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  )
}

export default function CouponsPage() {
  const coupons = useCoupons()
  const can = useAuthStore((state) => state.can)
  const [editingId, setEditingId] = useState(null)
  const [adding, setAdding] = useState(false)

  const editable = can('coupons.manage')

  if (coupons.isLoading) {
    return (
      <div className="grid place-items-center py-24">
        <Spinner />
      </div>
    )
  }

  if (coupons.isError) return <ErrorState error={coupons.error} onRetry={coupons.refetch} />

  const list = coupons.data ?? []

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink-900">Coupons</h1>
          <p className="mt-0.5 text-sm text-ink-500">Discount codes customers can redeem in their cart.</p>
        </div>

        {editable && !adding && (
          <Button
            variant="secondary"
            onClick={() => {
              setEditingId(null)
              setAdding(true)
            }}
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            New coupon
          </Button>
        )}
      </div>

      <section className={cx('rounded-card border border-ink-200 bg-white p-4')}>
        <div className="flex flex-col gap-2">
          {adding && <CouponForm coupon={null} onClose={() => setAdding(false)} />}

          {list.length === 0 && !adding ? (
            <p className="text-sm text-ink-500">No coupons yet.</p>
          ) : (
            list.map((coupon) => (
              <CouponRow
                key={coupon.id}
                coupon={coupon}
                editable={editable}
                editing={editingId === coupon.id}
                onEdit={() => {
                  setAdding(false)
                  setEditingId(coupon.id)
                }}
                onCloseEdit={() => setEditingId(null)}
              />
            ))
          )}
        </div>
      </section>
    </div>
  )
}
