import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { PackageSearch } from 'lucide-react'

import { Button } from '../../components/ui'
import { useAuthStore } from '../../stores/authStore'

/**
 * Look up one order by its number.
 *
 * This is what the "Order Track" link in the header promises, and what it
 * did not do: it pointed at `/orders`, the signed-in order history, which
 * sends a guest to a login screen and refuses any staff account outright
 * -- neither of which is tracking an order.
 *
 * The lookup itself already existed at `/orders/:number`, phone gate and
 * all. This page is only the front door to it, so there is one way an order
 * is displayed rather than two that can drift apart.
 */
export function TrackOrderPage() {
  const navigate = useNavigate()
  const user = useAuthStore((state) => state.user)

  const [number, setNumber] = useState('')
  const [phone, setPhone] = useState('')

  const submit = (event) => {
    event.preventDefault()

    const orderNumber = number.trim()
    if (!orderNumber) return

    /*
     * The phone is passed when it was given, and simply left out when it
     * was not. An order the signed-in customer owns is matched on their own
     * record and never needs it; for everyone else the order page answers
     * with its phone gate, which is the same question this form asks and
     * not worth asking twice here.
     */
    const query = phone.trim() ? `?phone=${encodeURIComponent(phone.trim())}` : ''

    navigate(`/orders/${encodeURIComponent(orderNumber)}${query}`)
  }

  return (
    <div className="mx-auto max-w-md">
      <div className="rounded-card border border-ink-200 bg-white p-6">
        <div className="grid h-11 w-11 place-items-center rounded-xl bg-brand-50 text-brand-700">
          <PackageSearch className="h-5 w-5" aria-hidden="true" />
        </div>

        <h1 className="mt-4 text-xl font-semibold text-ink-900">Track your order</h1>
        <p className="mt-1 text-sm text-ink-600">
          Enter the order number from your confirmation and we will show you where it has got
          to.
        </p>

        <form className="mt-5 flex flex-col gap-4" onSubmit={submit}>
          <div>
            <label
              htmlFor="track-number"
              className="mb-1 block text-sm font-medium text-ink-800"
            >
              Order number
            </label>
            <input
              id="track-number"
              value={number}
              onChange={(event) => setNumber(event.target.value)}
              placeholder="ORD-2026-000001"
              autoComplete="off"
              required
              className="h-11 w-full rounded-lg border border-ink-200 px-3 text-sm text-ink-900 placeholder:text-ink-400"
            />
          </div>

          <div>
            <label htmlFor="track-phone" className="mb-1 block text-sm font-medium text-ink-800">
              Mobile number
              <span className="ml-1 font-normal text-ink-400">
                {user ? '(if it was not your account)' : ''}
              </span>
            </label>
            <input
              id="track-phone"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="01XXXXXXXXX"
              inputMode="tel"
              autoComplete="tel"
              className="h-11 w-full rounded-lg border border-ink-200 px-3 text-sm text-ink-900 placeholder:text-ink-400"
            />
            <p className="mt-1 text-xs text-ink-500">
              The number the order was placed with. We ask because an order number on its own
              would let anyone read someone else&rsquo;s name and address.
            </p>
          </div>

          <Button type="submit" disabled={!number.trim()} className="h-11 justify-center">
            Track order
          </Button>
        </form>

        {user && (
          <p className="mt-4 border-t border-ink-100 pt-4 text-sm text-ink-600">
            Signed in?{' '}
            <Link to="/orders" className="font-medium text-brand-800 hover:underline">
              See every order on your account
            </Link>
            .
          </p>
        )}
      </div>
    </div>
  )
}
