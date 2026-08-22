import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CreditCard, Pencil, Plus, Trash2, X } from 'lucide-react'
import { api, get } from '../../lib/api'
import { cx, money } from '../../lib/format'
import { Badge, Button, ErrorState, Field, Select, Spinner, Textarea, useToast } from '../../components/ui'
import { useAuthStore } from '../../stores/authStore'

/**
 * How the shop gets paid.
 *
 * A method with no rows here never reaches checkout at all -- CheckoutPage
 * disables "Place order" until a payment method is selected, and there is
 * nothing to select from an empty list. So this screen exists mainly to make
 * sure that never happens silently: at least one active method, always
 * visible at a glance.
 */

const TYPES = [
  { value: 'cod', label: 'Cash on delivery — courier collects it' },
  { value: 'manual', label: 'Manual transfer — bKash, Nagad, bank, verified by staff' },
  { value: 'cash', label: 'Cash — taken in person, not offered at checkout' },
  { value: 'gateway', label: 'Online gateway' },
]

function useMethods() {
  return useQuery({
    queryKey: ['admin', 'payment-methods'],
    queryFn: () => get('/admin/payment-methods'),
    select: (response) => response.data,
  })
}

function MethodForm({ method, onClose }) {
  const toast = useToast()
  const queryClient = useQueryClient()

  const [form, setForm] = useState({
    name: method?.name ?? '',
    code: method?.code ?? '',
    type: method?.type ?? 'manual',
    instructions: method?.instructions ?? '',
    extra_charge: method?.extra_charge ?? '0.00',
    min_order_total: method?.min_order_total ?? '',
    max_order_total: method?.max_order_total ?? '',
    is_active: method?.is_active ?? true,
  })

  const set = (key, value) => setForm((previous) => ({ ...previous, [key]: value }))

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form.name.trim(),
        code: form.code.trim(),
        type: form.type,
        instructions: form.instructions.trim() || null,
        extra_charge: Number(form.extra_charge || 0),
        min_order_total: form.min_order_total === '' ? null : Number(form.min_order_total),
        max_order_total: form.max_order_total === '' ? null : Number(form.max_order_total),
        is_active: form.is_active,
      }

      const { data } = method
        ? await api.put(`/admin/payment-methods/${method.id}`, payload)
        : await api.post('/admin/payment-methods', payload)

      return data
    },
    onSuccess() {
      toast.success(method ? 'Payment method updated.' : 'Payment method added.')
      queryClient.invalidateQueries({ queryKey: ['admin', 'payment-methods'] })
      onClose()
    },
    onError(error) {
      toast.error(error?.message ?? 'Could not save that.')
    },
  })

  return (
    <div className="rounded-lg border border-ink-200 bg-ink-50 p-3">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-sm font-semibold text-ink-900">
          {method ? 'Edit payment method' : 'New payment method'}
        </h4>
        <button type="button" onClick={onClose} aria-label="Close" className="text-ink-500 hover:text-ink-800">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Field label="Name" value={form.name} onChange={(event) => set('name', event.target.value)} />

        <Field
          label="Code"
          hint="A short id, e.g. bkash. Cannot be changed once orders use it."
          value={form.code}
          onChange={(event) => set('code', event.target.value)}
        />

        <Field className="sm:col-span-2" label="Type">
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
          className="sm:col-span-2"
          label="Instructions (optional)"
          hint="Shown to the customer at checkout when this method is selected."
        >
          {({ id }) => (
            <Textarea
              id={id}
              rows={2}
              value={form.instructions}
              onChange={(event) => set('instructions', event.target.value)}
            />
          )}
        </Field>

        <Field
          label="Extra charge"
          type="number"
          step="0.01"
          min="0"
          hint="Added to the total when this method is chosen."
          value={form.extra_charge}
          onChange={(event) => set('extra_charge', event.target.value)}
        />

        <Field
          label="Minimum order"
          type="number"
          step="0.01"
          min="0"
          placeholder="No minimum"
          value={form.min_order_total}
          onChange={(event) => set('min_order_total', event.target.value)}
        />

        <Field
          label="Maximum order"
          type="number"
          step="0.01"
          min="0"
          placeholder="No maximum"
          hint="Caps how large an order can use this method — e.g. limit cash on delivery."
          value={form.max_order_total}
          onChange={(event) => set('max_order_total', event.target.value)}
        />
      </div>

      <label className="mt-3 flex items-center gap-2 text-sm text-ink-800">
        <input
          type="checkbox"
          checked={form.is_active}
          onChange={(event) => set('is_active', event.target.checked)}
          className="h-4 w-4 rounded border-ink-300 text-brand-800"
        />
        Offer this method at checkout
      </label>

      <div className="mt-3 flex gap-2">
        <Button
          onClick={() => save.mutate()}
          loading={save.isPending}
          disabled={!form.name.trim() || !form.code.trim()}
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

function MethodRow({ method, editable, editing, onEdit, onCloseEdit }) {
  const toast = useToast()
  const queryClient = useQueryClient()

  const remove = useMutation({
    mutationFn: () => api.delete(`/admin/payment-methods/${method.id}`),
    onSuccess() {
      toast.success('Payment method removed.')
      queryClient.invalidateQueries({ queryKey: ['admin', 'payment-methods'] })
    },
    onError(error) {
      toast.error(error?.message ?? 'Could not remove that.')
    },
  })

  if (editing) {
    return <MethodForm method={method} onClose={onCloseEdit} />
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-ink-100 px-3 py-2.5">
      <CreditCard className="h-4 w-4 shrink-0 text-ink-400" aria-hidden="true" />

      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-ink-900">
          {method.name}
          <Badge tone="neutral">{method.type_label}</Badge>
          {!method.is_active && <Badge tone="neutral">Off</Badge>}
        </p>
        <p className="text-xs text-ink-500">
          {method.code}
          {Number(method.extra_charge) > 0 && ` · +${money(method.extra_charge)}`}
          {method.min_order_total && ` · min ${money(method.min_order_total)}`}
          {method.max_order_total && ` · max ${money(method.max_order_total)}`}
        </p>
      </div>

      {editable && (
        <div className="flex shrink-0 gap-1">
          <button
            type="button"
            onClick={onEdit}
            aria-label={`Edit ${method.name}`}
            className="grid h-7 w-7 place-items-center rounded text-ink-500 hover:bg-ink-100 hover:text-ink-800"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => {
              if (window.confirm(`Remove "${method.name}"? This cannot be undone.`)) {
                remove.mutate()
              }
            }}
            aria-label={`Remove ${method.name}`}
            className="grid h-7 w-7 place-items-center rounded text-ink-500 hover:bg-ink-100 hover:text-danger-700"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  )
}

export default function PaymentMethodsPage() {
  const methods = useMethods()
  const can = useAuthStore((state) => state.can)
  const [editingId, setEditingId] = useState(null)
  const [adding, setAdding] = useState(false)

  const editable = can('payments.manage')

  if (methods.isLoading) {
    return (
      <div className="grid place-items-center py-24">
        <Spinner />
      </div>
    )
  }

  if (methods.isError) return <ErrorState error={methods.error} onRetry={methods.refetch} />

  const list = methods.data ?? []
  const activeCount = list.filter((m) => m.is_active).length

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink-900">Payment methods</h1>
          <p className="mt-0.5 text-sm text-ink-500">How customers pay at checkout.</p>
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
            New payment method
          </Button>
        )}
      </div>

      {activeCount === 0 && (
        <div
          className={cx(
            'rounded-card border p-3 text-sm',
            'border-warning-500/40 bg-warning-50 text-warning-700',
          )}
        >
          No payment method is active. Checkout has nothing to offer, so nobody can place an order
          until at least one is turned on.
        </div>
      )}

      <section className="rounded-card border border-ink-200 bg-white p-4">
        <div className="flex flex-col gap-2">
          {adding && (
            <MethodForm
              method={null}
              onClose={() => {
                setAdding(false)
              }}
            />
          )}

          {list.length === 0 && !adding ? (
            <p className="text-sm text-ink-500">No payment methods yet.</p>
          ) : (
            list.map((method) => (
              <MethodRow
                key={method.id}
                method={method}
                editable={editable}
                editing={editingId === method.id}
                onEdit={() => {
                  setAdding(false)
                  setEditingId(method.id)
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
