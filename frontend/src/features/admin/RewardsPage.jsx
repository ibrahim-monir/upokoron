import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  Award,
  Gift,
  Percent,
  Search,
  Sparkles,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react'
import { get, post, put } from '../../lib/api'
import { cx } from '../../lib/format'
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
  Spinner,
  TableWrap,
  Td,
  Th,
  useToast,
} from '../../components/ui'
import { useList, useRecord } from './useResource'

const earningFields = (unit) => [
  {
    key: 'earning_unit_bdt',
    label: 'Earning Unit',
    hint: 'Taka a shopper spends per earning unit',
    suffix: 'BDT',
    min: '1',
  },
  {
    key: 'points_per_hundred',
    label: 'Purchase',
    hint: `Points earned per ${unit} BDT spent`,
  },
  {
    key: 'review_points',
    label: 'Product Review',
    hint: 'Points per approved review',
  },
  {
    key: 'profile_completion_points',
    label: 'Sign-up + Profile Completion',
    hint: 'One-time bonus when profile reaches 100% (name, phone, birthday)',
  },
  {
    key: 'birthday_points',
    label: 'Birthday Bonus',
    hint: "Yearly bonus on customer's birthday",
  },
]

const REDEMPTION_FIELDS = [
  {
    key: 'redemption_rate',
    label: 'Point Value',
    hint: '1 point = how many BDT discount',
  },
  {
    key: 'min_redeem_points',
    label: 'Minimum Redemption',
    hint: 'Min points per redemption',
  },
  {
    key: 'max_redeem_points',
    label: 'Maximum Redemption',
    hint: 'Max points per order',
  },
  {
    key: 'max_redeem_percent_of_order',
    label: 'Max % of Cart Value',
    hint: 'Points discount cap as % of cart total',
    suffix: '%',
  },
  {
    key: 'expiry_days',
    label: 'Point Validity',
    hint: 'Days until points expire (FIFO)',
    suffix: 'days',
  },
]

function NumberField({ field, value, onChange }) {
  return (
    <Field label={field.label} hint={field.hint}>
      {({ id }) => (
        <div className="relative">
          <input
            id={id}
            type="number"
            min={field.min ?? '0'}
            step={field.key === 'redemption_rate' ? '0.01' : '1'}
            value={value ?? ''}
            onChange={(event) => onChange(field.key, event.target.value)}
            className="h-10 w-full rounded-lg border border-ink-300 bg-white px-3 pr-14 text-sm text-ink-900 hover:border-ink-400"
          />
          {field.suffix && (
            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs font-medium text-ink-400">
              {field.suffix}
            </span>
          )}
        </div>
      )}
    </Field>
  )
}

function SettingsTab() {
  const toast = useToast()
  const query = useRecord('admin-rewards-settings', '/admin/rewards/settings')
  const [values, setValues] = useState(null)
  const [saving, setSaving] = useState(false)
  const can = useAuthStore((state) => state.can)

  useEffect(() => {
    if (query.data?.data) setValues(query.data.data)
  }, [query.data])

  if (query.isLoading || values === null) {
    return (
      <div className="grid place-items-center py-16">
        <Spinner />
      </div>
    )
  }

  if (query.isError) return <ErrorState error={query.error} onRetry={query.refetch} />

  const set = (key, raw) => setValues((current) => ({ ...current, [key]: raw }))

  const save = async () => {
    setSaving(true)

    try {
      const body = Object.fromEntries(
        Object.entries(values).map(([key, value]) => {
          if (key === 'redemption_rate') return [key, value]
          if (key === 'rewards_enabled' || key === 'show_points_on_product_page') return [key, Boolean(value)]

          return [key, Math.trunc(Number(value) || 0)]
        }),
      )

      const { data } = await put('/admin/rewards/settings', body)
      setValues(data)
      toast.success('Reward point settings saved.')
    } catch (error) {
      toast.error(error?.message ?? 'Could not save settings.')
    } finally {
      setSaving(false)
    }
  }

  const summary = [
    `Purchase: ${values.points_per_hundred} pts per ${values.earning_unit_bdt} BDT`,
    `1 point = ${values.redemption_rate} BDT discount`,
    `Redemption: min ${values.min_redeem_points} – max ${values.max_redeem_points} pts per order`,
    `Max discount: ${values.max_redeem_percent_of_order}% of cart value`,
    `Points expire after ${values.expiry_days} days (oldest used first)`,
    `Review bonus: ${values.review_points} pts · Profile completion: ${values.profile_completion_points} pts · Birthday: ${values.birthday_points} pts`,
  ]

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="overflow-hidden">
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-success-600" aria-hidden="true" />
                Point Earning Rules
              </span>
            }
          />
          <div className="flex flex-col gap-4 p-4">
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-ink-200 p-3">
              <input
                type="checkbox"
                checked={Boolean(values.rewards_enabled)}
                onChange={(event) => set('rewards_enabled', event.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-ink-300"
              />
              <span>
                <span className="block text-sm font-medium text-ink-800">Enable reward points program</span>
                <span className="mt-0.5 block text-[11px] text-ink-500">
                  Master switch. Off means nothing below applies — no points earned, no redemption at
                  checkout, and the product-page line stays hidden regardless of that setting.
                </span>
              </span>
            </label>

            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-ink-200 p-3">
              <input
                type="checkbox"
                checked={Boolean(values.show_points_on_product_page)}
                onChange={(event) => set('show_points_on_product_page', event.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-ink-300"
              />
              <span>
                <span className="block text-sm font-medium text-ink-800">Show points on product page</span>
                <span className="mt-0.5 block text-[11px] text-ink-500">
                  Tells shoppers "Earn N points" on the storefront. Purchases still earn points either way.
                </span>
              </span>
            </label>

            {earningFields(values.earning_unit_bdt).map((field) => (
              <NumberField key={field.key} field={field} value={values[field.key]} onChange={set} />
            ))}
          </div>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                <Gift className="h-4 w-4 text-brand-600" aria-hidden="true" />
                Redemption Rules
              </span>
            }
          />
          <div className="flex flex-col gap-4 p-4">
            {REDEMPTION_FIELDS.map((field) => (
              <NumberField key={field.key} field={field} value={values[field.key]} onChange={set} />
            ))}
          </div>
        </Card>
      </div>

      <Card className="border-brand-200 bg-brand-50/60 p-4">
        <p className="flex items-center gap-2 text-sm font-semibold text-brand-900">
          <Sparkles className="h-4 w-4" aria-hidden="true" />
          Active Rules Summary
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-brand-800">
          {summary.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </Card>

      {can('rewards.adjust') && (
        <div>
          <Button onClick={save} loading={saving}>
            Save changes
          </Button>
        </div>
      )}
    </div>
  )
}

function CustomersTab({ onAdjust }) {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const can = useAuthStore((state) => state.can)

  const query = useList('admin-rewards-customers', '/admin/rewards/customers', {
    search: search || undefined,
    page,
  })

  const rows = query.data?.data ?? []

  return (
    <div className="flex flex-col gap-4">
      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" aria-hidden="true" />
        <Input
          value={search}
          onChange={(event) => {
            setSearch(event.target.value)
            setPage(1)
          }}
          placeholder="Search name, phone or email..."
          aria-label="Search customers"
          className="pl-9"
        />
      </div>

      {query.isError ? (
        <ErrorState error={query.error} onRetry={query.refetch} />
      ) : query.isLoading ? (
        <div className="grid place-items-center py-16">
          <Spinner />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState icon={Users} title="No customers found" description="Try a different search." />
      ) : (
        <TableWrap>
          <thead>
            <tr>
              <Th>Customer</Th>
              <Th>Phone</Th>
              <Th>Email</Th>
              <Th numeric>Points balance</Th>
              <Th>Actions</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((customer) => (
              <tr key={customer.id}>
                <Td>
                  <p className="font-medium text-ink-900">{customer.name}</p>
                  <p className="text-xs text-ink-400">{customer.code}</p>
                </Td>
                <Td>{customer.phone || '—'}</Td>
                <Td>{customer.email || '—'}</Td>
                <Td numeric>
                  <Badge tone={customer.reward_points_balance > 0 ? 'success' : 'neutral'}>
                    {customer.reward_points_balance}
                  </Badge>
                </Td>
                <Td>
                  {can('rewards.adjust') && (
                    <button
                      type="button"
                      onClick={() => onAdjust(customer)}
                      className="rounded-lg border border-ink-200 px-3 py-1.5 text-xs font-semibold text-ink-700 hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700"
                    >
                      Adjust
                    </button>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}

      <Pagination meta={query.data?.meta} onPage={setPage} />
    </div>
  )
}

function AdjustmentModal({ customer, onClose }) {
  const toast = useToast()
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(customer)
  const [results, setResults] = useState([])
  const [points, setPoints] = useState('')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (customer) {
      setSelected(customer)
    }
  }, [customer])

  useEffect(() => {
    if (selected || !search.trim()) {
      setResults([])
      return
    }

    let cancelled = false
    const timer = setTimeout(async () => {
      const { data } = await get('/admin/rewards/customers', { params: { search: search.trim(), per_page: 5 } })
      if (!cancelled) setResults(data)
    }, 300)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [search, selected])

  const submit = async (event) => {
    event.preventDefault()

    const value = parseInt(points, 10)

    if (!selected || !value || !reason.trim()) return

    setSaving(true)

    try {
      await post('/admin/rewards/adjustments', {
        customer_id: selected.id,
        points: value,
        reason: reason.trim(),
      })

      toast.success('Points adjusted.')
      onClose(true)
    } catch (error) {
      toast.error(error?.message ?? 'Could not adjust points.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink-950/40 p-4" onClick={() => onClose(false)}>
      <div
        className="w-full max-w-md rounded-2xl bg-white p-5 shadow-raised"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="flex items-center gap-2 text-base font-semibold text-ink-900">
          <Wallet className="h-4 w-4 text-brand-600" aria-hidden="true" />
          Manual Adjustment
        </h2>

        {!selected ? (
          <div className="mt-4 flex flex-col gap-2">
            <Input
              autoFocus
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search customer by name, phone or email..."
              aria-label="Search customer"
            />
            {results.length > 0 && (
              <ul className="max-h-56 overflow-y-auto rounded-lg border border-ink-200">
                {results.map((row) => (
                  <li key={row.id}>
                    <button
                      type="button"
                      onClick={() => setSelected(row)}
                      className="flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-ink-50"
                    >
                      <span className="font-medium text-ink-900">{row.name}</span>
                      <span className="text-xs text-ink-500">
                        {row.phone || row.email} · {row.reward_points_balance} pts
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <form onSubmit={submit} className="mt-4 flex flex-col gap-3">
            <div className="flex items-center justify-between rounded-lg bg-ink-50 px-3 py-2">
              <div>
                <p className="text-sm font-medium text-ink-900">{selected.name}</p>
                <p className="text-xs text-ink-500">Current balance: {selected.reward_points_balance} pts</p>
              </div>
              {!customer && (
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  className="text-xs font-medium text-brand-700 hover:underline"
                >
                  Change
                </button>
              )}
            </div>

            <Field label="Points" hint="Positive to credit, negative to debit">
              {({ id }) => (
                <input
                  id={id}
                  type="number"
                  value={points}
                  onChange={(event) => setPoints(event.target.value)}
                  placeholder="e.g. 100 or -50"
                  className="h-10 w-full rounded-lg border border-ink-300 bg-white px-3 text-sm text-ink-900 hover:border-ink-400"
                />
              )}
            </Field>

            <Field label="Reason" required>
              {({ id }) => (
                <input
                  id={id}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="Why is this adjustment being made?"
                  className="h-10 w-full rounded-lg border border-ink-300 bg-white px-3 text-sm text-ink-900 hover:border-ink-400"
                />
              )}
            </Field>

            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="secondary" onClick={() => onClose(false)}>
                Cancel
              </Button>
              <Button type="submit" loading={saving} disabled={!points || !reason.trim()}>
                Save adjustment
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

export default function RewardsPage() {
  const [tab, setTab] = useState('customers')
  const [modalCustomer, setModalCustomer] = useState(undefined)
  const can = useAuthStore((state) => state.can)
  const queryClient = useQueryClient()

  const closeModal = (changed) => {
    setModalCustomer(undefined)
    if (changed) {
      queryClient.invalidateQueries({ queryKey: ['admin-rewards-customers'] })
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {modalCustomer !== undefined && (
        <AdjustmentModal customer={modalCustomer} onClose={closeModal} />
      )}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold text-ink-900">
            <Award className="h-5 w-5 text-brand-600" aria-hidden="true" />
            Reward Points
          </h1>
          <p className="mt-1 text-sm text-ink-500">
            Manage customer loyalty points — earning rules, redemption, and history
          </p>
        </div>

        {can('rewards.adjust') && (
          <Button onClick={() => setModalCustomer(null)}>
            <Percent className="h-4 w-4" aria-hidden="true" />
            Manual Adjustment
          </Button>
        )}
      </div>

      <div className="inline-flex w-fit rounded-xl border border-ink-200 bg-white p-1">
        {[
          { key: 'customers', label: 'Customers' },
          { key: 'settings', label: 'Settings' },
        ].map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setTab(item.key)}
            className={cx(
              'rounded-lg px-4 py-1.5 text-sm font-semibold transition-colors',
              tab === item.key ? 'bg-brand-600 text-white' : 'text-ink-600 hover:bg-ink-50',
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === 'customers' ? (
        <CustomersTab onAdjust={(customer) => setModalCustomer(customer)} />
      ) : (
        <SettingsTab />
      )}
    </div>
  )
}
