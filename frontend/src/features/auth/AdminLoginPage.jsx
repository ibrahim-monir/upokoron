import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Eye, EyeOff, ShieldCheck } from 'lucide-react'
import { ApiError } from '../../lib/api'
import { cx } from '../../lib/format'
import { useAuthStore } from '../../stores/authStore'
import { Button, Card, Field, PageLoader, useToast } from '../../components/ui'
import { applyServerErrors } from './applyServerErrors'

const schema = z.object({
  identifier: z.string().min(1, 'Enter your email or mobile number.'),
  password: z.string().min(1, 'Enter your password.'),
})

export function AdminLoginPage() {
  const login = useAuthStore((state) => state.login)
  const user = useAuthStore((state) => state.user)
  const loading = useAuthStore((state) => state.loading)
  const can = useAuthStore((state) => state.can)
  const navigate = useNavigate()
  const location = useLocation()
  const toast = useToast()
  const [showPassword, setShowPassword] = useState(false)

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { identifier: '', password: '' },
  })

  if (loading) return <PageLoader />

  if (user && can('admin.access')) {
    return <Navigate to={location.state?.from?.pathname ?? '/admin'} replace />
  }

  const onSubmit = async (values) => {
    try {
      await login({ ...values, admin: true })

      navigate(location.state?.from?.pathname ?? '/admin', { replace: true })
    } catch (error) {
      if (error instanceof ApiError) {
        // The API refuses an account without admin.access at login rather
        // than letting it in and 403-ing every screen afterwards.
        applyServerErrors(error, setError, toast, { fallbackField: 'identifier' })
        return
      }

      toast.error('Could not sign in. Please try again.')
    }
  }

  return (
    <div className="grid min-h-screen place-items-center bg-ink-900 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-2 text-white">
          <span className="grid h-10 w-10 place-items-center rounded-lg bg-brand-600">
            <ShieldCheck className="h-5 w-5" aria-hidden="true" />
          </span>
          <span className="text-lg font-semibold">Upokoron Admin</span>
        </div>

        <Card className="p-6">
          <h1 className="text-lg font-semibold text-ink-900">Staff sign in</h1>
          <p className="mt-1 text-sm text-ink-500">This area is for store staff only.</p>

          <form onSubmit={handleSubmit(onSubmit)} className="mt-5 flex flex-col gap-4" noValidate>
            <Field
              label="Email or mobile"
              required
              autoComplete="username"
              error={errors.identifier?.message}
              {...register('identifier')}
            />

            <Field label="Password" required error={errors.password?.message}>
              {({ id, describedBy, invalid }) => (
                <div className="relative">
                  <input
                    id={id}
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    aria-invalid={invalid ? 'true' : undefined}
                    aria-describedby={describedBy}
                    className={cx(
                      'h-10 w-full rounded-lg border bg-white px-3 pr-10 text-sm text-ink-900 transition-colors',
                      'placeholder:text-ink-400',
                      'disabled:bg-ink-100 disabled:text-ink-500',
                      invalid ? 'border-danger-500' : 'border-ink-300 hover:border-ink-400',
                    )}
                    {...register('password')}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((value) => !value)}
                    className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-ink-400 hover:text-ink-600"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              )}
            </Field>

            <p className="-mt-2 text-right text-sm">
              <Link to="/forgot-password" className="font-medium text-brand-700 underline underline-offset-4">
                Forgot password?
              </Link>
            </p>

            <Button type="submit" loading={isSubmitting} className="w-full justify-center">
              Sign in
            </Button>
          </form>
        </Card>

        <p className="mt-4 text-center text-sm text-ink-400">
          <a href="/" className="underline underline-offset-4 hover:text-ink-200">
            Back to the shop
          </a>
        </p>
      </div>
    </div>
  )
}
