import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ApiError } from '../../lib/api'
import { useAuthStore } from '../../stores/authStore'
import { Button, Card, Field, useToast } from '../../components/ui'
import { applyServerErrors } from './applyServerErrors'

// Mirrors the Laravel FormRequest. Client validation is for fast feedback;
// the server's rules are the ones that count.
const schema = z.object({
  identifier: z.string().min(1, 'Enter your mobile number or email.'),
  password: z.string().min(1, 'Enter your password.'),
  remember: z.boolean().optional(),
})

export function LoginPage() {
  const login = useAuthStore((state) => state.login)
  const navigate = useNavigate()
  const location = useLocation()
  const toast = useToast()

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { identifier: '', password: '', remember: false },
  })

  const onSubmit = async (values) => {
    try {
      const user = await login(values)

      toast.success(`Welcome back, ${user.name.split(' ')[0]}.`)

      // Finish the journey they were on before the guard interrupted.
      navigate(location.state?.from?.pathname ?? '/', { replace: true })
    } catch (error) {
      if (error instanceof ApiError) {
        applyServerErrors(error, setError, toast)
        return
      }

      toast.error('Could not sign in. Please try again.')
    }
  }

  return (
    <div className="mx-auto w-full max-w-md py-6">
      <Card className="p-6">
        <h1 className="text-xl font-semibold text-ink-900">Sign in</h1>
        <p className="mt-1 text-sm text-ink-500">Use your mobile number or email address.</p>

        <form onSubmit={handleSubmit(onSubmit)} className="mt-6 flex flex-col gap-4" noValidate>
          <Field
            label="Mobile or email"
            required
            error={errors.identifier?.message}
            autoComplete="username"
            placeholder="01712345678"
            {...register('identifier')}
          />

          <Field
            label="Password"
            required
            type="password"
            autoComplete="current-password"
            error={errors.password?.message}
            {...register('password')}
          />

          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-sm text-ink-700">
              <input type="checkbox" className="h-4 w-4 rounded border-ink-300" {...register('remember')} />
              Keep me signed in
            </label>

            <Link to="/forgot-password" className="text-sm font-medium text-brand-700 underline underline-offset-4">
              Forgot password?
            </Link>
          </div>

          <Button type="submit" loading={isSubmitting} className="w-full justify-center">
            Sign in
          </Button>
        </form>

        <p className="mt-5 text-center text-sm text-ink-600">
          New here?{' '}
          <Link to="/register" className="font-medium text-brand-700 underline underline-offset-4">
            Create an account
          </Link>
        </p>
      </Card>
    </div>
  )
}
