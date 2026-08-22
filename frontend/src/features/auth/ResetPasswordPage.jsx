import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ApiError, post } from '../../lib/api'
import { Button, Card, Field, useToast } from '../../components/ui'
import { applyServerErrors } from './applyServerErrors'

const schema = z
  .object({
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

export function ResetPasswordPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const toast = useToast()

  const token = params.get('token') ?? ''
  const email = params.get('email') ?? ''

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { password: '', password_confirmation: '' },
  })

  const onSubmit = async (values) => {
    try {
      await post('/shop/auth/reset-password', { ...values, token, email })

      toast.success('Password reset. You can sign in now.')
      navigate('/login', { replace: true })
    } catch (error) {
      if (error instanceof ApiError) {
        applyServerErrors(error, setError, toast)
        return
      }

      toast.error('Could not reset the password. Please try again.')
    }
  }

  if (!token || !email) {
    return (
      <div className="mx-auto w-full max-w-md py-6">
        <Card className="p-6 text-center">
          <h1 className="text-xl font-semibold text-ink-900">Link incomplete</h1>
          <p className="mt-1 text-sm text-ink-500">
            This reset link is missing its token. Request a new one from the sign-in page.
          </p>

          <Link
            to="/forgot-password"
            className="mt-5 inline-block text-sm font-medium text-brand-800 underline underline-offset-4"
          >
            Request a new link
          </Link>
        </Card>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-md py-6">
      <Card className="p-6">
        <h1 className="text-xl font-semibold text-ink-900">Choose a new password</h1>
        <p className="mt-1 text-sm text-ink-500">Resetting the password for {email}.</p>

        <form onSubmit={handleSubmit(onSubmit)} className="mt-6 flex flex-col gap-4" noValidate>
          <Field
            label="New password"
            required
            type="password"
            autoComplete="new-password"
            hint="At least 8 characters, with a letter and a number."
            error={errors.password?.message}
            {...register('password')}
          />

          <Field
            label="Confirm new password"
            required
            type="password"
            autoComplete="new-password"
            error={errors.password_confirmation?.message}
            {...register('password_confirmation')}
          />

          <Button type="submit" loading={isSubmitting} className="w-full justify-center">
            Reset password
          </Button>
        </form>
      </Card>
    </div>
  )
}
