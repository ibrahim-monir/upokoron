import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Eye, EyeOff } from 'lucide-react'

import { ApiError, put } from '../../../lib/api'
import { cx } from '../../../lib/format'
import { useToast } from '../../../components/ui'
import { applyServerErrors } from '../applyServerErrors'
import { AccountButton, Panel } from './shell'

const schema = z
  .object({
    current_password: z.string().min(1, 'Enter your current password.'),
    password: z
      .string()
      .min(8, 'Use at least 8 characters.')
      .regex(/[a-zA-Z]/, 'Include at least one letter.')
      .regex(/\d/, 'Include at least one number.'),
    password_confirmation: z.string(),
  })
  .refine((values) => values.password === values.password_confirmation, {
    message: 'The passwords do not match.',
    path: ['password_confirmation'],
  })

/** A password box with the reveal toggle the design puts inside it. */
function PasswordInput({ label, required, error, footer, ...props }) {
  const [shown, setShown] = useState(false)

  return (
    <div>
      <label htmlFor={props.name} className="mb-1.5 block text-sm font-semibold text-ink-800">
        {label}
        {required && <span className="ml-0.5 text-ink-500">*</span>}
      </label>

      <div className="relative">
        <input
          id={props.name}
          type={shown ? 'text' : 'password'}
          placeholder="Enter Password"
          aria-invalid={error ? 'true' : undefined}
          className={cx(
            'h-12 w-full rounded-full border px-4 pr-12 text-sm text-ink-900 transition-colors',
            'placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30',
            error ? 'border-danger-500' : 'border-ink-200 hover:border-ink-300',
          )}
          {...props}
        />

        <button
          type="button"
          onClick={() => setShown((value) => !value)}
          aria-label={shown ? 'Hide password' : 'Show password'}
          className="absolute right-4 top-1/2 -translate-y-1/2 text-ink-400 transition hover:text-ink-700"
        >
          {shown ? <Eye className="h-4.5 w-4.5" /> : <EyeOff className="h-4.5 w-4.5" />}
        </button>
      </div>

      {error ? <p className="mt-1 text-xs text-danger-700">{error}</p> : footer}
    </div>
  )
}

export function PasswordManager() {
  const toast = useToast()

  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { current_password: '', password: '', password_confirmation: '' },
  })

  const onSubmit = async (values) => {
    try {
      await put('/shop/auth/password', values)

      // Every other token is revoked server-side, so say so rather than
      // letting someone discover it on their phone an hour later.
      toast.success('Password changed. You have been signed out on other devices.')
      reset()
    } catch (error) {
      if (error instanceof ApiError) {
        applyServerErrors(error, setError, toast)
        return
      }

      toast.error('Could not change your password.')
    }
  }

  return (
    <Panel>
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5" noValidate>
        <PasswordInput
          label="Password"
          required
          autoComplete="current-password"
          error={errors.current_password?.message}
          footer={
            <div className="mt-2 text-right">
              <Link
                to="/forgot-password"
                className="text-sm font-semibold text-navy-900 underline underline-offset-4 hover:text-brand-800"
              >
                Forgot Password?
              </Link>
            </div>
          }
          {...register('current_password')}
        />

        <PasswordInput
          label="New Password"
          required
          autoComplete="new-password"
          error={errors.password?.message}
          {...register('password')}
        />

        <PasswordInput
          label="Confirm New Password"
          required
          autoComplete="new-password"
          error={errors.password_confirmation?.message}
          {...register('password_confirmation')}
        />

        <div>
          <AccountButton type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Updating…' : 'Update Password'}
          </AccountButton>
        </div>
      </form>
    </Panel>
  )
}
