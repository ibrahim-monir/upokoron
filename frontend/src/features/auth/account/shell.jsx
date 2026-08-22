import { cx } from '../../../lib/format'

/*
 * The shared furniture of the account screens.
 *
 * The design is one panel per section, all of them the same shape: a title,
 * a line of explanation, and a form. Keeping that shape here means a new
 * section is a form, not a form plus a re-drawing of the box around it.
 */

export function Panel({ title, description, actions, children, className }) {
  const hasHeader = Boolean(title || actions)

  return (
    <section className={cx('rounded-2xl border border-ink-200 bg-white', className)}>
      {hasHeader && (
        <header className="flex flex-wrap items-start justify-between gap-3 px-5 pb-4 pt-5 sm:px-6">
          <div className="min-w-0">
            {title && <h2 className="text-xl font-bold text-ink-900">{title}</h2>}
            {description && <p className="mt-1 text-sm text-ink-500">{description}</p>}
          </div>
          {actions}
        </header>
      )}

      {/* Without a header the content is the top of the box and needs its own room. */}
      <div className={cx('px-5 pb-5 sm:px-6 sm:pb-6', !hasHeader && 'pt-5 sm:pt-6')}>
        {children}
      </div>
    </section>
  )
}

/** A labelled input, styled as the pill-shaped field the design uses. */
export function AccountField({
  label,
  required,
  error,
  hint,
  className,
  children,
  htmlFor,
  ...props
}) {
  const id = htmlFor ?? props.name

  return (
    <div className={cx('min-w-0', className)}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold text-ink-800">
        {label}
        {required && <span className="ml-0.5 text-ink-500">*</span>}
      </label>

      {children ?? (
        <input
          id={id}
          aria-invalid={error ? 'true' : undefined}
          className={cx(
            'h-12 w-full rounded-full border px-4 text-sm text-ink-900 transition-colors',
            'placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30',
            error ? 'border-danger-500' : 'border-ink-200 hover:border-ink-300',
          )}
          {...props}
        />
      )}

      {error ? (
        <p className="mt-1 text-xs text-danger-700">{error}</p>
      ) : (
        hint && <p className="mt-1 text-xs text-ink-500">{hint}</p>
      )}
    </div>
  )
}

/** The pill-shaped select and textarea that go with the field above. */
export const fieldClass =
  'h-12 w-full rounded-full border border-ink-200 bg-white px-4 text-sm text-ink-900 ' +
  'transition-colors hover:border-ink-300 focus:outline-none focus:ring-2 focus:ring-brand-500/30'

/** The solid dark action button the design leads every form with. */
export function AccountButton({ className, variant = 'primary', ...props }) {
  return (
    <button
      className={cx(
        'inline-flex h-12 items-center justify-center gap-2 rounded-full px-7',
        'text-sm font-semibold transition disabled:pointer-events-none disabled:opacity-60',
        variant === 'primary' && 'bg-navy-900 text-white hover:bg-navy-800',
        variant === 'outline' &&
          'border border-ink-300 bg-white text-ink-800 hover:border-ink-400 hover:bg-ink-50',
        variant === 'danger' && 'text-danger-700 hover:bg-danger-50',
        className,
      )}
      {...props}
    />
  )
}
