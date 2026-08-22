import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react'
import { cx } from '../../lib/format'

const ToastContext = createContext(null)

const TONES = {
  success: { icon: CheckCircle2, className: 'border-success-500 bg-success-50 text-success-700' },
  error: { icon: XCircle, className: 'border-danger-500 bg-danger-50 text-danger-700' },
  warning: { icon: AlertTriangle, className: 'border-warning-500 bg-warning-50 text-warning-700' },
  info: { icon: Info, className: 'border-brand-500 bg-brand-50 text-brand-800' },
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const dismiss = useCallback((id) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  const push = useCallback(
    (message, tone = 'info', timeout = 4500) => {
      const id = crypto.randomUUID()

      setToasts((current) => [...current, { id, message, tone }])

      if (timeout) setTimeout(() => dismiss(id), timeout)

      return id
    },
    [dismiss],
  )

  const value = useMemo(
    () => ({
      push,
      dismiss,
      success: (message) => push(message, 'success'),
      error: (message) => push(message, 'error', 7000),
      warning: (message) => push(message, 'warning'),
      info: (message) => push(message, 'info'),
    }),
    [push, dismiss],
  )

  return (
    <ToastContext.Provider value={value}>
      {children}

      {/* Polite: a confirmation should not interrupt what is being read. */}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-full max-w-sm flex-col gap-2"
      >
        {toasts.map(({ id, message, tone }) => {
          const { icon: Icon, className } = TONES[tone] ?? TONES.info

          return (
            <div
              key={id}
              className={cx(
                'pointer-events-auto flex items-start gap-2.5 rounded-lg border-l-4 bg-white p-3 shadow-raised',
                className,
              )}
            >
              <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <p className="flex-1 text-sm">{message}</p>
              <button
                type="button"
                onClick={() => dismiss(id)}
                aria-label="Dismiss"
                className="rounded p-0.5 opacity-60 hover:opacity-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const context = useContext(ToastContext)

  if (!context) throw new Error('useToast must be used inside a ToastProvider.')

  return context
}
