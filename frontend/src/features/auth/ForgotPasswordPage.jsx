import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Link } from 'react-router-dom'
import { MailCheck } from 'lucide-react'
import { ApiError, post } from '../../lib/api'
import { Button, Card, Field, useToast } from '../../components/ui'
import { applyServerErrors } from './applyServerErrors'
import { useTranslation } from '../../lib/i18n'

const schema = z.object({
  email: z.string().email('Enter a valid email address.'),
})

export function ForgotPasswordPage() {
  const { t } = useTranslation()

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
      await post('/shop/auth/forgot-password', values)
      setSentTo(values.email)
    } catch (error) {
      if (error instanceof ApiError) {
        applyServerErrors(error, setError, toast)
        return
      }

      toast.error(t('forgot.failed'))
    }
  }

  if (sentTo) {
    return (
      <div className="mx-auto w-full max-w-md py-6">
        <Card className="p-6 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-brand-50 text-brand-800">
            <MailCheck className="h-6 w-6" aria-hidden="true" />
          </span>

          <h1 className="mt-4 text-xl font-semibold text-ink-900">{t('forgot.checkTitle')}</h1>
          <p className="mt-1 text-sm text-ink-500">
            {t('forgot.if')} <span className="font-medium text-ink-700">{sentTo}</span> {t('forgot.sent')}
          </p>

          <Link
            to="/login"
            className="mt-5 inline-block text-sm font-medium text-brand-800 underline underline-offset-4"
          >
            {t('forgot.back')}
          </Link>
        </Card>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-md py-6">
      <Card className="p-6">
        <h1 className="text-xl font-semibold text-ink-900">{t('forgot.title')}</h1>
        <p className="mt-1 text-sm text-ink-500">
          {t('forgot.intro')}
        </p>

        <form onSubmit={handleSubmit(onSubmit)} className="mt-6 flex flex-col gap-4" noValidate>
          <Field
            label={t('forgot.email')}
            type="email"
            required
            autoComplete="email"
            error={errors.email?.message}
            {...register('email')}
          />

          <Button type="submit" loading={isSubmitting} className="w-full justify-center">
            {t('forgot.submit')}
          </Button>
        </form>

        <p className="mt-5 text-center text-sm text-ink-600">
          {t('forgot.remembered')}{' '}
          <Link to="/login" className="font-medium text-brand-800 underline underline-offset-4">
            {t('forgot.back')}
          </Link>
        </p>
      </Card>
    </div>
  )
}
