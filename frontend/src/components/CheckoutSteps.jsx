import { Link } from 'react-router-dom'
import { Check } from 'lucide-react'
import { cx } from '../lib/format'
import { useTranslation } from '../lib/i18n'

const STEPS = [
  { key: 'cart', labelKey: 'steps.cart', to: '/cart' },
  { key: 'checkout', labelKey: 'steps.checkout', to: '/checkout' },
  { key: 'complete', labelKey: 'steps.orderComplete', to: null },
]

/**
 * The cart -> checkout -> order complete progress trail, shown at the top
 * of all three pages so a shopper always knows where they are and can step
 * back to a page already passed. Only past steps are links -- Checkout has
 * nothing to show for an unpicked address, and there is no "the" order to
 * jump to before one has been placed.
 */
export function CheckoutSteps({ current }) {
  const { t } = useTranslation()
  const currentIndex = STEPS.findIndex((step) => step.key === current)

  return (
    <div className="mx-auto my-2 w-fit max-w-full rounded-card border border-ink-200 bg-ink-50 px-4 py-2">
      <ol className="flex flex-wrap items-center justify-center gap-2 text-sm sm:gap-3">
        {STEPS.map((step, index) => {
          const isCurrent = index === currentIndex
          const isPast = index < currentIndex
          const isClickable = isPast && step.to

          const content = (
            <span
              className={cx(
                'flex items-center gap-2 font-medium',
                isCurrent ? 'text-brand-800' : isPast ? 'text-ink-700' : 'text-ink-400',
              )}
            >
              <span
                className={cx(
                  'grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold transition-colors',
                  isCurrent
                    ? 'bg-brand-600 text-white shadow-sm'
                    : isPast
                      ? 'bg-brand-100 text-brand-800'
                      : 'border border-ink-200 bg-white text-ink-400',
                )}
              >
                {isPast ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : index + 1}
              </span>
              {t(step.labelKey)}
            </span>
          )

          return (
            <li key={step.key} className="flex items-center gap-2 sm:gap-3">
              {index > 0 && (
                <span
                  className={cx('h-px w-6 sm:w-12', isPast || isCurrent ? 'bg-brand-300' : 'bg-ink-200')}
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
    </div>
  )
}
