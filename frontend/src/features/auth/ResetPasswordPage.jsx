import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ApiError, post } from '../../lib/api'
import { Button, Card, Field, useToast } from '../../components/ui'
import { applyServerErrors } from './applyServerErrors'
import { useTranslation } from '../../lib/i18n'

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
  const { t } = useTranslation()

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

      toast.success(t('reset.done'))
      navigate('/login', { replace: true })
    } catch (error) {
      if (error instanceof ApiError) {
        applyServerErrors(error, setError, toast)
        return
      }

      toast.error(t('reset.failed'))
    }
  }

  if (!token || !email) {
    return (
      <div className="mx-auto w-full max-w-md py-6">
        <Card className="p-6 text-center">
          <h1 className="text-xl font-semibold text-ink-900">{t('reset.incompleteTitle')}</h1>
          <p className="mt-1 text-sm text-ink-500">
            {t('reset.incomplete')}
          </p>

          <Link
            to="/forgot-password"
            className="mt-5 inline-block text-sm font-medium text-brand-800 underline underline-offset-4"
          >
            {t('reset.requestNew')}
          </Link>
        </Card>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-md py-6">
      <Card className="p-6">
        <h1 className="text-xl font-semibold text-ink-900">{t('reset.title')}</h1>
        <p className="mt-1 text-sm text-ink-500">{t('reset.for')} {email}.</p>

        <form onSubmit={handleSubmit(onSubmit)} className="mt-6 flex flex-col gap-4" noValidate>
          <Field
            label={t('reset.password')}
            required
            type="password"
            autoComplete="new-password"
            hint={t('reset.passwordHint')}
            error={errors.password?.message}
            {...register('password')}
          />

          <Field
            label={t('reset.confirm')}
            required
            type="password"
            autoComplete="new-password"
            error={errors.password_confirmation?.message}
            {...register('password_confirmation')}
          />

          <Button type="submit" loading={isSubmitting} className="w-full justify-center">
            {t('reset.submit')}
          </Button>
        </form>
      </Card>
    </div>
  )
}
