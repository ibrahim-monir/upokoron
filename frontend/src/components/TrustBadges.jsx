import { useQuery } from '@tanstack/react-query'
import { CreditCard, Headset, Truck } from 'lucide-react'
import { get } from '../lib/api'

/**
 * The payment methods this shop actually switched on.
 *
 * Same query key as the footer's, so the two share one cached answer rather
 * than asking twice on a page that shows both.
 */
function useAcceptedPayments() {
  const query = useQuery({
    queryKey: ['shop', 'accepted-payments'],
    queryFn: () => get('/shop/accepted-payments'),
    staleTime: 5 * 60 * 1000,
    select: (response) => response.data,
  })

  return query.data ?? []
}

/**
 * How to say what the shop takes, without naming a wallet it does not.
 *
 * This line used to read "Cash on delivery, bKash, Nagad & bank" whatever was
 * configured, which is the same bug the footer had: a shop that has never
 * turned Nagad on was advertising it two clicks from checkout. Four names is
 * where it stops -- past that this is a paragraph, not a badge, and the real
 * list is in the footer and on the checkout screen itself.
 */
function paymentSummary(methods) {
  const names = methods.map((method) => method.name).filter(Boolean)

  if (names.length === 0) return 'Choose how to pay at checkout'
  if (names.length <= 4) return names.join(', ')

  return `${names.slice(0, 3).join(', ')} & ${names.length - 3} more`
}

/** Three short reasons to keep going, the way a checkout page earns trust. */
export function TrustBadges() {
  const payments = useAcceptedPayments()

  const items = [
    { icon: Truck, title: 'Fast delivery', body: 'Delivered across Bangladesh' },
    { icon: CreditCard, title: 'Flexible payment', body: paymentSummary(payments) },
    { icon: Headset, title: 'Real support', body: "We're a call or message away" },
  ]

  return (
    <div className="grid gap-4 rounded-card border border-ink-200 bg-white p-4 sm:grid-cols-3 sm:p-6">
      {items.map(({ icon: Icon, title, body }) => (
        <div key={title} className="flex items-center gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-800">
            <Icon className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <p className="text-sm font-semibold text-ink-900">{title}</p>
            <p className="text-xs text-ink-500">{body}</p>
          </div>
        </div>
      ))}
    </div>
  )
}
