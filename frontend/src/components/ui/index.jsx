import { Loader2, PackageOpen } from 'lucide-react'
import { cx } from '../../lib/format'

export { Button } from './Button'
export { Field, Input, Select, Textarea } from './Field'
export { RichTextEditor } from './RichTextEditor'
export { ToastProvider, useToast } from './Toast'

export function Card({ className, children, ...props }) {
  return (
    <div
      className={cx('rounded-card border border-ink-200 bg-white shadow-card', className)}
      {...props}
    >
      {children}
    </div>
  )
}

export function CardHeader({ title, description, actions, className }) {
  return (
    <div className={cx('flex items-start justify-between gap-4 border-b border-ink-200 p-4', className)}>
      <div className="min-w-0">
        <h2 className="text-base font-semibold text-ink-900">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-ink-500">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  )
}

const BADGE_TONES = {
  neutral: 'bg-ink-100 text-ink-700',
  brand: 'bg-brand-50 text-brand-800',
  accent: 'bg-accent-50 text-accent-700',
  success: 'bg-success-50 text-success-700',
  warning: 'bg-warning-50 text-warning-700',
  danger: 'bg-danger-50 text-danger-700',
}

/**
 * State is encoded in form as well as text, so what needs attention reads at
 * a glance rather than requiring the label to be read.
 */
export function Badge({ tone = 'neutral', className, children }) {
  return (
    <span
      className={cx(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        BADGE_TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}

export function Spinner({ className }) {
  return (
    <Loader2
      className={cx('h-5 w-5 animate-spin text-ink-400', className)}
      aria-label="Loading"
      role="status"
    />
  )
}

export function PageLoader({ label = 'Loading' }) {
  return (
    <div className="flex min-h-64 flex-col items-center justify-center gap-3 text-ink-500">
      <Spinner className="h-6 w-6" />
      <p className="text-sm">{label}…</p>
    </div>
  )
}

export function EmptyState({ icon: Icon = PackageOpen, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
      <div className="rounded-full bg-ink-100 p-3">
        <Icon className="h-6 w-6 text-ink-400" aria-hidden="true" />
      </div>
      <div>
        <p className="font-medium text-ink-800">{title}</p>
        {description && <p className="mt-1 max-w-sm text-sm text-ink-500">{description}</p>}
      </div>
      {action}
    </div>
  )
}

export function ErrorState({ error, onRetry }) {
  return (
    <div className="rounded-card border border-danger-500/30 bg-danger-50 p-4">
      <p className="font-medium text-danger-700">{error?.message ?? 'Something went wrong.'}</p>
      {error?.code && <p className="mt-1 text-xs text-danger-700/80">Code: {error.code}</p>}
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 text-sm font-medium text-danger-700 underline underline-offset-4"
        >
          Try again
        </button>
      )}
    </div>
  )
}

/** Wide content scrolls inside its own container; the page never does. */
export function TableWrap({ className, children }) {
  return (
    <div className={cx('scroll-x rounded-card border border-ink-200 bg-white', className)}>
      <table className="w-full min-w-max text-sm">{children}</table>
    </div>
  )
}

export function Th({ numeric, className, children, ...props }) {
  return (
    <th
      scope="col"
      className={cx(
        'border-b border-ink-200 bg-ink-50 px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-ink-600',
        numeric ? 'numeric' : 'text-left',
        className,
      )}
      {...props}
    >
      {children}
    </th>
  )
}

export function Td({ numeric, className, children, ...props }) {
  return (
    <td
      className={cx('border-b border-ink-100 px-3 py-2.5 text-ink-800', numeric && 'numeric tabular', className)}
      {...props}
    >
      {children}
    </td>
  )
}

export function Pagination({ meta, onPage }) {
  if (!meta || meta.last_page <= 1) return null

  const { current_page: current, last_page: last, total } = meta

  return (
    <div className="flex items-center justify-between gap-4 px-1 py-3">
      <p className="text-sm text-ink-500">
        Page {current} of {last} · {total} total
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onPage(current - 1)}
          disabled={current <= 1}
          className="rounded-lg border border-ink-300 px-3 py-1.5 text-sm disabled:opacity-40"
        >
          Previous
        </button>
        <button
          type="button"
          onClick={() => onPage(current + 1)}
          disabled={current >= last}
          className="rounded-lg border border-ink-300 px-3 py-1.5 text-sm disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </div>
  )
}
