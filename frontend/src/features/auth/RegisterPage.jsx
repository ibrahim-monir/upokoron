import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Link, useNavigate } from 'react-router-dom'
import { ApiError } from '../../lib/api'
import { useAuthStore } from '../../stores/authStore'
import { Button, Card, Field, useToast } from '../../components/ui'
import { applyServerErrors } from './applyServerErrors'

/*
 * Mirrors RegisterRequest on the server, including the rule that at least
 * one contact method is required. In Bangladesh the mobile number is usually
 * the real identifier, so email is optional.
 */
const schema = z
  .object({
    name: z.string().min(1, 'Enter your name.').max(120),
    phone: z
      .string()
      .regex(/^01[3-9]\d{8}$/, 'Enter a valid mobile number, for example 01712345678.')
      .or(z.literal('')),
    email: z.string().email('Enter a valid email address.').or(z.literal('')),
    password: z
      .string()
      .min(8, 'Use at least 8 characters.')
      .regex(/[a-zA-Z]/, 'Include at least one letter.')
      .regex(/\d/, 'Include at least one number.'),
    password_confirmation: z.string(),
  })
  .refine((values) => values.phone !== '' || values.email !== '', {
    message: 'Enter a mobile number or an email address.',
    path: ['phone'],
  })
  .refine((values) => values.password === values.password_confirmation, {
    message: 'The passwords do not match.',
    path: ['password_confirmation'],
  })

export function RegisterPage() {
  const registerCustomer = useAuthStore((state) => state.register)
  const navigate = useNavigate()
  const toast = useToast()

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { name: '', phone: '', email: '', password: '', password_confirmation: '' },
  })

  const onSubmit = async (values) => {
    try {
      await registerCustomer({
        ...values,
        phone: values.phone || null,
        email: values.email || null,
      })

      toast.success('Account created. Welcome to Upokoron.')
      navigate('/', { replace: true })
    } catch (error) {
      if (error instanceof ApiError) {
        applyServerErrors(error, setError, toast)
        return
      }

      toast.error('Could not create the account. Please try again.')
    }
  }

  return (
    <div className="mx-auto w-full max-w-md py-6">
      <Card className="p-6">
        <h1 className="text-xl font-semibold text-ink-900">Create an account</h1>
        <p className="mt-1 text-sm text-ink-500">A mobile number is enough to get started.</p>

        <form onSubmit={handleSubmit(onSubmit)} className="mt-6 flex flex-col gap-4" noValidate>
          <Field
            label="Full name"
            required
            autoComplete="name"
            error={errors.name?.message}
            {...register('name')}
          />

          <Field
            label="Mobile number"
            placeholder="01712345678"
            inputMode="numeric"
            autoComplete="tel"
            error={errors.phone?.message}
            {...register('phone')}
          />

          <Field
            label="Email address"
            type="email"
            autoComplete="email"
            hint="Optional, but needed if you ever want to reset your password."
            error={errors.email?.message}
            {...register('email')}
          />

          <Field
            label="Password"
            required
            type="password"
            autoComplete="new-password"
            hint="At least 8 characters, with a letter and a number."
            error={errors.password?.message}
            {...register('password')}
          />

          <Field
            label="Confirm password"
            required
            type="password"
            autoComplete="new-password"
            error={errors.password_confirmation?.message}
            {...register('password_confirmation')}
          />

          <Button type="submit" loading={isSubmitting} className="w-full justify-center">
            Create account
          </Button>
        </form>

        <p className="mt-5 text-center text-sm text-ink-600">
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-brand-700 underline underline-offset-4">
            Sign in
          </Link>
        </p>
      </Card>
    </div>
  )
}
