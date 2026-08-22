import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CreditCard, Smartphone, Wallet } from 'lucide-react'

import { ApiError, del, get, post, put } from '../../../lib/api'
import { cx } from '../../../lib/format'
import { Spinner, useToast } from '../../../components/ui'
import { AccountButton, AccountField, Panel, fieldClass } from './shell'

const ICONS = {
  bkash: Smartphone,
  nagad: Smartphone,
  rocket: Smartphone,
  upay: Smartphone,
}

function iconFor(saved) {
  if (saved.is_card) return CreditCard

  return ICONS[saved.method?.code] ?? Wallet
}

function useSavedMethods() {
  return useQuery({
    queryKey: ['shop', 'payment-methods'],
    queryFn: () => get('/shop/payment-methods'),
  })
}

/* -------------------------------------------------------
   Add form
------------------------------------------------------- */

function AddSavedMethod({ available }) {
  const queryClient = useQueryClient()
  const toast = useToast()

  const [methodId, setMethodId] = useState('')
  const [number, setNumber] = useState('')
  const [label, setLabel] = useState('')
  const [errors, setErrors] = useState({})

  const chosen = available.find((method) => String(method.id) === methodId)

  const save = useMutation({
    mutationFn: (body) => post('/shop/payment-methods', body),
    onSuccess(data) {
      queryClient.invalidateQueries({ queryKey: ['shop', 'payment-methods'] })
      toast.success(data?.message ?? 'Payment method saved.')

      setMethodId('')
      setNumber('')
      setLabel('')
      setErrors({})
    },
    onError(error) {
      if (error instanceof ApiError && error.isValidation) {
        setErrors(error.fieldErrors?.() ?? {})
        return
      }

      toast.error(error?.message ?? 'Could not save this payment method.')
    },
  })

  if (available.length === 0) {
    return (
      <Panel title="Add a payment method">
        <p className="text-sm text-ink-500">
          The shop is not accepting any payment method you can save details for right now.
        </p>
      </Panel>
    )
  }

  return (
    <Panel
      title="Add a payment method"
      description="Save the wallet you pay from so you do not have to type it at checkout."
    >
      <form
        className="flex flex-col gap-5"
        onSubmit={(event) => {
          event.preventDefault()
          setErrors({})

          save.mutate({
            payment_method_id: Number(methodId),
            account_number: number.trim(),
            label: label.trim() || null,
          })
        }}
      >
        <AccountField label="Pay with" required htmlFor="saved-method" error={errors.payment_method_id}>
          <select
            id="saved-method"
            value={methodId}
            required
            onChange={(event) => setMethodId(event.target.value)}
            className={fieldClass}
          >
            <option value="">Choose a payment method</option>
            {available.map((method) => (
              <option key={method.id} value={method.id}>
                {method.name}
              </option>
            ))}
          </select>
        </AccountField>

        {chosen?.instructions && (
          <p className="-mt-2 rounded-2xl bg-ink-50 px-4 py-3 text-xs leading-relaxed text-ink-600">
            {chosen.instructions}
          </p>
        )}

        <AccountField
          label="Your wallet number"
          required
          name="account_number"
          inputMode="tel"
          placeholder="01XXXXXXXXX"
          value={number}
          onChange={(event) => setNumber(event.target.value)}
          error={errors.account_number}
          hint="The number you send the money from."
        />

        <AccountField
          label="Label (Optional)"
          name="label"
          placeholder="Personal, Office…"
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          error={errors.label}
        />

        <div>
          <AccountButton type="submit" disabled={save.isPending || !methodId || !number.trim()}>
            {save.isPending ? 'Saving…' : 'Save Payment Method'}
          </AccountButton>
        </div>
      </form>
    </Panel>
  )
}

/* -------------------------------------------------------
   Section
------------------------------------------------------- */

export function PaymentMethods() {
  const query = useSavedMethods()
  const queryClient = useQueryClient()
  const toast = useToast()

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['shop', 'payment-methods'] })

  const makeDefault = useMutation({
    mutationFn: (id) => put(`/shop/payment-methods/${id}`, { is_default: true }),
    onSuccess() {
      invalidate()
      toast.success('Default payment method updated.')
    },
    onError: (error) => toast.error(error?.message ?? 'Could not update that.'),
  })

  const remove = useMutation({
    mutationFn: (id) => del(`/shop/payment-methods/${id}`),
    onSuccess() {
      invalidate()
      toast.success('Payment method removed.')
    },
    onError: (error) => toast.error(error?.message ?? 'Could not remove that.'),
  })

  if (query.isLoading) {
    return (
      <Panel>
        <div className="grid place-items-center py-16">
          <Spinner />
        </div>
      </Panel>
    )
  }

  if (query.error?.status === 403) {
    return (
      <Panel title="This account does not save payment details">
        <p className="text-sm text-ink-600">
          Saved payment methods belong to customer accounts.
        </p>
      </Panel>
    )
  }

  if (query.isError) {
    return (
      <Panel title="Could not load your payment methods">
        <p className="text-sm text-danger-700">{query.error?.message}</p>
        <AccountButton type="button" onClick={query.refetch} className="mt-4">
          Try again
        </AccountButton>
      </Panel>
    )
  }

  const saved = query.data?.data ?? []
  const available = query.data?.available ?? []

  return (
    <div className="flex flex-col gap-5">
      <Panel
        title="Payment Method"
        description="The wallets you have saved for paying."
      >
        {saved.length === 0 ? (
          <p className="py-2 text-sm text-ink-500">
            Nothing saved yet. Add a wallet below and checkout will offer it.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {saved.map((entry) => {
              const Icon = iconFor(entry)

              return (
                <li
                  key={entry.id}
                  className={cx(
                    'flex flex-wrap items-center gap-4 rounded-2xl border px-5 py-4',
                    entry.is_default ? 'border-brand-300 bg-brand-50/40' : 'border-ink-200',
                  )}
                >
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white text-brand-700 ring-1 ring-inset ring-ink-200">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-bold text-ink-900">{entry.method?.name ?? 'Saved method'}</p>

                      {entry.label && (
                        <span className="rounded-full bg-ink-100 px-2 py-0.5 text-[11px] font-semibold text-ink-600">
                          {entry.label}
                        </span>
                      )}

                      {entry.is_default && (
                        <span className="rounded-full bg-accent-50 px-2 py-0.5 text-[11px] font-semibold text-accent-700">
                          Default
                        </span>
                      )}
                    </div>

                    <p className="mt-0.5 text-sm tabular text-ink-600">{entry.display_number}</p>
                  </div>

                  <div className="flex shrink-0 items-center gap-4">
                    {!entry.is_default && (
                      <button
                        type="button"
                        disabled={makeDefault.isPending}
                        onClick={() => makeDefault.mutate(entry.id)}
                        className="text-sm font-semibold text-ink-700 hover:text-brand-800 disabled:opacity-50"
                      >
                        Make default
                      </button>
                    )}

                    <button
                      type="button"
                      disabled={remove.isPending}
                      onClick={() => {
                        if (window.confirm(`Remove ${entry.display_number} from your account?`)) {
                          remove.mutate(entry.id)
                        }
                      }}
                      className="text-sm font-semibold text-danger-700 hover:text-danger-500 disabled:opacity-50"
                    >
                      Delete
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </Panel>

      <AddSavedMethod available={available} />

      <p className="px-1 text-xs leading-relaxed text-ink-500">
        Card details are not stored on your account. Saving a card means saving a token issued
        by a payment gateway, and this shop does not have one connected yet — so there is no
        card number here to be lost.
      </p>
    </div>
  )
}
