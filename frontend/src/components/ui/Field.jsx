import { forwardRef, useId } from 'react'
import { cx } from '../../lib/format'

/**
 * A labelled input that wires its own error and hint to the control via
 * aria-describedby, so a screen reader hears why the field was rejected
 * rather than just that it was.
 */
export const Field = forwardRef(function Field(
  { label, error, hint, required, className, children, ...props },
  ref,
) {
  const id = useId()
  const errorId = `${id}-error`
  const hintId = `${id}-hint`

  const describedBy = [error && errorId, hint && hintId].filter(Boolean).join(' ') || undefined

  return (
    <div className={cx('flex flex-col gap-1.5', className)}>
      {label && (
        <label htmlFor={id} className="text-sm font-medium text-ink-800">
          {label}
          {required && <span className="text-danger-500 ml-0.5" aria-hidden="true">*</span>}
        </label>
      )}

      {children ? (
        children({ id, describedBy, invalid: Boolean(error) })
      ) : (
        <input
          ref={ref}
          id={id}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={describedBy}
          className={cx(
            'h-10 rounded-lg border bg-white px-3 text-sm text-ink-900 transition-colors',
            'placeholder:text-ink-400',
            'disabled:bg-ink-100 disabled:text-ink-500',
            error ? 'border-danger-500' : 'border-ink-300 hover:border-ink-400',
          )}
          {...props}
        />
      )}

      {hint && !error && (
        <p id={hintId} className="text-xs text-ink-500">
          {hint}
        </p>
      )}

      {error && (
        <p id={errorId} role="alert" className="text-xs text-danger-700">
          {error}
        </p>
      )}
    </div>
  )
})

export const Input = forwardRef(function Input({ invalid, className, ...props }, ref) {
  return (
    <input
      ref={ref}
      aria-invalid={invalid ? 'true' : undefined}
      className={cx(
        'h-10 w-full rounded-lg border bg-white px-3 text-sm text-ink-900 transition-colors',
        'placeholder:text-ink-400 disabled:bg-ink-100',
        invalid ? 'border-danger-500' : 'border-ink-300 hover:border-ink-400',
        className,
      )}
      {...props}
    />
  )
})

/**
 * Widths are the caller's business.
 *
 * `cx` joins class names; it does not resolve Tailwind conflicts. So a base
 * `w-full` here does not lose to a `w-32` passed in -- whichever rule sits
 * later in the stylesheet wins, and that was `w-full`. Every filter select
 * that asked for a fixed width was silently rendering at the container's
 * full width, which only stayed invisible because the rows happened to wrap.
 *
 * The default is applied only when the caller names no width of its own.
 */
export const Select = forwardRef(function Select({ invalid, className, children, ...props }, ref) {
  const setsOwnWidth = /(^|\s)(w-|min-w-|max-w-|flex-1|grow)/.test(className ?? '')

  return (
    <select
      ref={ref}
      aria-invalid={invalid ? 'true' : undefined}
      className={cx(
        'h-10 rounded-lg border bg-white px-3 text-sm text-ink-900',
        setsOwnWidth ? null : 'w-full',
        invalid ? 'border-danger-500' : 'border-ink-300 hover:border-ink-400',
        className,
      )}
      {...props}
    >
      {children}
    </select>
  )
})

export const Textarea = forwardRef(function Textarea({ invalid, className, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      aria-invalid={invalid ? 'true' : undefined}
      className={cx(
        'min-h-24 w-full rounded-lg border bg-white p-3 text-sm text-ink-900',
        'placeholder:text-ink-400',
        invalid ? 'border-danger-500' : 'border-ink-300 hover:border-ink-400',
        className,
      )}
      {...props}
    />
  )
})
