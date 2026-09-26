import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Link, useNavigate } from 'react-router-dom'
import { ApiError } from '../../lib/api'
import { useAuthStore } from '../../stores/authStore'
import { Button, Card, Field, useToast } from '../../components/ui'
import { applyServerErrors } from './applyServerErrors'
import { useTranslation } from '../../lib/i18n'

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
  const { t } = useTranslation()

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

      toast.success(t('register.created'))
      navigate('/', { replace: true })
    } catch (error) {
      if (error instanceof ApiError) {
        applyServerErrors(error, setError, toast)
        return
      }

      toast.error(t('register.failed'))
    }
  }

  return (
    <div className="mx-auto w-full max-w-md py-6">
      <Card className="p-6">
        <h1 className="text-xl font-semibold text-ink-900">{t('register.title')}</h1>
        <p className="mt-1 text-sm text-ink-500">{t('register.intro')}</p>

        <form onSubmit={handleSubmit(onSubmit)} className="mt-6 flex flex-col gap-4" noValidate>
          <Field
            label={t('register.name')}
            required
            autoComplete="name"
            error={errors.name?.message}
            {...register('name')}
          />

          <Field
            label={t('register.phone')}
            placeholder="01712345678"
            inputMode="numeric"
            autoComplete="tel"
            error={errors.phone?.message}
            {...register('phone')}
          />

          <Field
            label={t('register.email')}
            type="email"
            autoComplete="email"
            hint={t('register.emailHint')}
            error={errors.email?.message}
            {...register('email')}
          />

          <Field
            label={t('register.password')}
            required
            type="password"
            autoComplete="new-password"
            hint={t('register.passwordHint')}
            error={errors.password?.message}
            {...register('password')}
          />

          <Field
            label={t('register.confirm')}
            required
            type="password"
            autoComplete="new-password"
            error={errors.password_confirmation?.message}
            {...register('password_confirmation')}
          />

          <Button type="submit" loading={isSubmitting} className="w-full justify-center">
            {t('register.submit')}
          </Button>
        </form>

        <p className="mt-5 text-center text-sm text-ink-600">
          {t('register.haveAccount')}{' '}
          <Link to="/login" className="font-medium text-brand-800 underline underline-offset-4">
            {t('register.signIn')}
          </Link>
        </p>
      </Card>
    </div>
  )
}
