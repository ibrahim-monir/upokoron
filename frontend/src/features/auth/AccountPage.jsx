import { useSearchParams } from 'react-router-dom'

import { cx } from '../../lib/format'
import { LogoutPanel } from './account/LogoutPanel'
import { ManageAddress } from './account/ManageAddress'
import { MyOrders } from './account/MyOrders'
import { PasswordManager } from './account/PasswordManager'
import { PaymentMethods } from './account/PaymentMethods'
import { PersonalInformation } from './account/PersonalInformation'

/*
 * Which section is open lives in the URL rather than in state, so the back
 * button works, a reload keeps you where you were, and "look at my orders"
 * is a link somebody can be sent.
 */
const SECTIONS = [
  { key: 'profile', label: 'Personal Information', Component: PersonalInformation },
  { key: 'orders', label: 'My Orders', Component: MyOrders },
  { key: 'addresses', label: 'Manage Address', Component: ManageAddress },
  { key: 'payment', label: 'Payment Method', Component: PaymentMethods },
  { key: 'password', label: 'Password Manager', Component: PasswordManager },
  { key: 'logout', label: 'Logout', Component: LogoutPanel },
]

export function AccountPage() {
  const [params, setParams] = useSearchParams()

  const requested = params.get('section')
  const active = SECTIONS.find((section) => section.key === requested) ?? SECTIONS[0]
  const Active = active.Component

  const open = (key) => {
    const next = new URLSearchParams(params)

    if (key === SECTIONS[0].key) next.delete('section')
    else next.set('section', key)

    setParams(next)
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)] lg:gap-8">
      <nav aria-label="Account sections" className="flex flex-col gap-3">
        {SECTIONS.map((section) => {
          const selected = section.key === active.key

          return (
            <button
              key={section.key}
              type="button"
              onClick={() => open(section.key)}
              aria-current={selected ? 'page' : undefined}
              className={cx(
                'rounded-2xl px-6 py-4 text-left text-base font-semibold transition',
                selected
                  ? 'bg-brand-400 text-navy-900'
                  : 'border border-ink-200 bg-white text-ink-800 hover:border-ink-300 hover:bg-ink-50',
              )}
            >
              {section.label}
            </button>
          )
        })}
      </nav>

      <div className="min-w-0">
        <Active />
      </div>
    </div>
  )
}
