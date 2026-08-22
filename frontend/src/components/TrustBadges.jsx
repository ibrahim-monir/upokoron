import { CreditCard, Headset, Truck } from 'lucide-react'

/** Three short reasons to keep going, the way a checkout page earns trust. */
export function TrustBadges() {
  const items = [
    { icon: Truck, title: 'Fast delivery', body: 'Delivered across Bangladesh' },
    { icon: CreditCard, title: 'Flexible payment', body: 'Cash on delivery, bKash, Nagad & bank' },
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
