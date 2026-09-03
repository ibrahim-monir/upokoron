import { useState } from 'react'
import { Copy, Receipt } from 'lucide-react'
import { dateTime, money } from '../../lib/format'
import { Button, Field, useToast } from '../../components/ui'
import { useSubmitPaymentReference } from './useCheckout'

/**
 * "I have sent the money -- here is the transaction id."
 *
 * Shown only for methods the customer settles themselves (bKash, Nagad, a
 * bank transfer). What it submits is a claim, not a payment: the order stays
 * unpaid until somebody at the shop finds that id on the statement. The
 * wording says so on purpose -- a customer told "payment received" by a form
 * that received no payment will rightly be angry when the parcel does not move.
 *
 * Editable after the fact, because the commonest thing to land in this box is
 * a mistyped digit, and a customer who cannot fix their own typo telephones
 * instead.
 */
export function PaymentReferenceCard({ order, phone }) {
  const toast = useToast()
  const submit = useSubmitPaymentReference()

  const submitted = order.payment_reference ?? ''
  const [value, setValue] = useState(submitted)
  const [editing, setEditing] = useState(!submitted)

  if (!order.can_submit_payment_reference) return null

  const receiveNumber = order.payment_method?.receive_number
  const due = Number(order.due_total ?? 0)

  const copyNumber = () => {
    navigator.clipboard
      .writeText(receiveNumber)
      .then(() => toast.success('Number copied.'))
      .catch(() => toast.error('Could not copy the number.'))
  }

  const send = (event) => {
    event.preventDefault()

    const reference = value.trim()

    if (!reference) {
      toast.error('Enter the transaction ID first.')
      return
    }

    submit.mutate(
      { number: order.number, reference, phone },
      {
        onSuccess: () => {
          setEditing(false)
          toast.success('Thanks — we will confirm your payment shortly.')
        },
        onError: (error) => toast.error(error?.message ?? 'Could not save that.'),
      },
    )
  }

  return (
    <section className="rounded-card border border-brand-200 bg-brand-50 p-4">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-ink-900">
        <Receipt className="h-4 w-4 text-brand-800" aria-hidden="true" />
        Paid by {order.payment_method?.name ?? 'transfer'}?
      </h2>

      {due > 0 && receiveNumber && (
        <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-ink-700">
          Send {money(due)} to
          <span className="tabular font-semibold text-brand-800">{receiveNumber}</span>
          <button
            type="button"
            onClick={copyNumber}
            aria-label="Copy the receive number"
            className="grid h-6 w-6 place-items-center rounded text-brand-700 hover:bg-brand-100"
          >
            <Copy className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </p>
      )}

      {submitted && !editing ? (
        <div className="mt-2">
          <p className="text-sm text-ink-700">
            Transaction ID <span className="tabular font-semibold text-ink-900">{submitted}</span> received
            {order.payment_reference_at && ` on ${dateTime(order.payment_reference_at)}`}. We are checking it
            against our records — the order is marked paid once we have.
          </p>

          <button
            type="button"
            onClick={() => setEditing(true)}
            className="mt-2 text-sm font-medium text-brand-800 underline underline-offset-2 hover:text-brand-900"
          >
            Sent a different one? Change it
          </button>
        </div>
      ) : (
        <form className="mt-2 flex flex-wrap items-end gap-2" onSubmit={send}>
          <Field
            className="min-w-[12rem] flex-1"
            label="Transaction ID"
            hint="The ID your bKash/Nagad message gave you after sending."
            placeholder="e.g. 9F4KJ2XY7B"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            maxLength={64}
          />

          <Button type="submit" loading={submit.isPending}>
            Submit
          </Button>

          {submitted && (
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setValue(submitted)
                setEditing(false)
              }}
            >
              Cancel
            </Button>
          )}
        </form>
      )}
    </section>
  )
}
