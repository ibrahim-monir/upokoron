import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Link } from 'react-router-dom'
import { MailCheck } from 'lucide-react'
import { ApiError, post } from '../../lib/api'
import { Button, Card, Field, useToast } from '../../components/ui'
import { applyServerErrors } from './applyServerErrors'

const schema = z.object({
  email: z.string().email('Enter a valid email address.'),
})

export function ForgotPasswordPage() {
  const toast = useToast()
  const [sentTo, setSentTo] = useState(null)

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { email: '' },
  })

  const onSubmit = async (values) => {
    try {
      await post('/auth/forgot-password', values)
      setSentTo(values.email)
    } catch (error) {
      if (error instanceof ApiError) {
        applyServerErrors(error, setError, toast)
        return
      }

      toast.error('Could not send the reset link. Please try again.')
    }
  }

  if (sentTo) {
    return (
      <div className="mx-auto w-full max-w-md py-6">
        <Card className="p-6 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-brand-50 text-brand-600">
            <MailCheck className="h-6 w-6" aria-hidden="true" />
          </span>

          <h1 className="mt-4 text-xl font-semibold text-ink-900">Check your email</h1>
          <p className="mt-1 text-sm text-ink-500">
            If <span className="font-medium text-ink-700">{sentTo}</span> has an account, a reset link is on
            its way. It expires after a while, so use it soon. Check spam if it does not show up in a few
            minutes.
          </p>

          <Link
            to="/login"
            className="mt-5 inline-block text-sm font-medium text-brand-700 underline underline-offset-4"
          >
            Back to sign in
          </Link>
        </Card>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-md py-6">
      <Card className="p-6">
        <h1 className="text-xl font-semibold text-ink-900">Forgot your password?</h1>
        <p className="mt-1 text-sm text-ink-500">
          Enter the email on your account and we will send you a reset link.
        </p>

        <form onSubmit={handleSubmit(onSubmit)} className="mt-6 flex flex-col gap-4" noValidate>
          <Field
            label="Email address"
            type="email"
            required
            autoComplete="email"
            error={errors.email?.message}
            {...register('email')}
          />

          <Button type="submit" loading={isSubmitting} className="w-full justify-center">
            Send reset link
          </Button>
        </form>

        <p className="mt-5 text-center text-sm text-ink-600">
          Remembered it?{' '}
          <Link to="/login" className="font-medium text-brand-700 underline underline-offset-4">
            Back to sign in
          </Link>
        </p>
      </Card>
    </div>
  )
}
