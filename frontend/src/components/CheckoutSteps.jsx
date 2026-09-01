import { Link } from 'react-router-dom'
import { Check } from 'lucide-react'
import { cx } from '../lib/format'

const STEPS = [
  { key: 'cart', label: 'Cart', to: '/cart' },
  { key: 'checkout', label: 'Checkout', to: '/checkout' },
  { key: 'complete', label: 'Order complete', to: null },
]

/**
 * The cart -> checkout -> order complete progress trail, shown at the top
 * of all three pages so a shopper always knows where they are and can step
 * back to a page already passed. Only past steps are links -- Checkout has
 * nothing to show for an unpicked address, and there is no "the" order to
 * jump to before one has been placed.
 */
export function CheckoutSteps({ current }) {
  const currentIndex = STEPS.findIndex((step) => step.key === current)

  return (
    <ol className="flex flex-wrap items-center gap-1.5 text-sm">
      {STEPS.map((step, index) => {
        const isCurrent = index === currentIndex
        const isPast = index < currentIndex
        const isClickable = isPast && step.to

        const content = (
          <span
            className={cx(
              'flex items-center gap-1.5 font-medium',
              isCurrent ? 'text-brand-800' : isPast ? 'text-ink-700' : 'text-ink-400',
            )}
          >
            <span
              className={cx(
                'grid h-5 w-5 shrink-0 place-items-center rounded-full text-xs font-bold',
                isCurrent ? 'bg-brand-600 text-white' : isPast ? 'bg-brand-100 text-brand-800' : 'bg-ink-100 text-ink-400',
              )}
            >
              {isPast ? <Check className="h-3 w-3" aria-hidden="true" /> : index + 1}
            </span>
            {step.label}
          </span>
        )

        return (
          <li key={step.key} className="flex items-center gap-1.5">
            {index > 0 && (
              <span
                className={cx('h-px w-6 sm:w-10', isPast || isCurrent ? 'bg-brand-300' : 'bg-ink-200')}
                aria-hidden="true"
              />
            )}
            {isClickable ? (
              <Link to={step.to} className="hover:opacity-80">
                {content}
              </Link>
            ) : (
              content
            )}
          </li>
        )
      })}
    </ol>
  )
}
