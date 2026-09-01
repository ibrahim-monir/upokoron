import { Loader2 } from 'lucide-react'
import { cx } from '../../lib/format'

const VARIANTS = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 active:bg-brand-800 shadow-card',
  accent: 'bg-accent-500 text-white hover:bg-accent-600 active:bg-accent-700 shadow-card',
  secondary: 'bg-white text-ink-800 border border-ink-300 hover:bg-ink-50 active:bg-ink-100',
  soft: 'bg-brand-50 text-brand-800 border border-brand-100 hover:bg-brand-100 active:bg-brand-200',
  ghost: 'text-ink-700 hover:bg-ink-100 active:bg-ink-200',
  danger: 'bg-danger-500 text-white hover:bg-danger-700 active:bg-danger-700 shadow-card',
  link: 'text-brand-800 hover:text-brand-800 underline underline-offset-4',
}

const SIZES = {
  sm: 'h-8 px-3 text-sm gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
  lg: 'h-12 px-6 text-base gap-2',
  icon: 'h-9 w-9 justify-center',
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  className,
  children,
  type = 'button',
  ...props
}) {
  return (
    <button
      type={type}
      // A button mid-request must not be pressable again -- double-submitting
      // a checkout is how duplicate orders happen.
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx(
        'inline-flex items-center rounded-lg font-medium transition-colors',
        'disabled:pointer-events-none disabled:opacity-50',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
      {children}
    </button>
  )
}
