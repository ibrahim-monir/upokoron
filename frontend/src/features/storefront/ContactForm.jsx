import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { CheckCircle2, Send } from 'lucide-react'

import { ApiError, post } from '../../lib/api'
import { cx } from '../../lib/format'
import { Button, Card, useToast } from '../../components/ui'
import { applyServerErrors } from '../auth/applyServerErrors'

/*
 * Mirrors the server's rules rather than inventing its own, so a message
 * that will be refused is caught here instead of after a round trip. The
 * server still checks all of it -- this is a courtesy, not the guard.
 */
const schema = z
  .object({
    name: z.string().min(1, 'Enter your name.').max(120),
    phone: z
      .string()
      .regex(/^01[3-9]\d{8}$/, 'Enter a valid mobile number.')
      .or(z.literal('')),
    email: z.string().email('Enter a valid email address.').or(z.literal('')),
    subject: z.string().max(160).or(z.literal('')),
    message: z
      .string()
      .min(10, 'Tell us a little more — at least 10 characters.')
      .max(5000, 'That is longer than we can accept.'),
  })
  .refine((values) => values.phone !== '' || values.email !== '', {
    message: 'Leave a mobile number or an email address so we can reply.',
    path: ['phone'],
  })

const fieldClass =
  'h-11 w-full rounded-lg border border-ink-200 bg-white px-3 text-sm text-ink-900 transition-all ' +
  'placeholder:text-ink-400 hover:border-ink-300 ' +
  'focus:border-brand-600 focus:outline-none focus:ring-4 focus:ring-brand-600/10'

function FormField({ label, htmlFor, error, children }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="block text-sm font-medium text-ink-800">
        {label}
      </label>

      <div className="mt-1.5">{children}</div>

      {error && <p className="mt-1 text-xs font-medium text-danger-700">{error}</p>}
    </div>
  )
}

export function ContactForm() {
  const toast = useToast()
  const [sent, setSent] = useState(false)

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { name: '', phone: '', email: '', subject: '', message: '' },
  })

  const send = useMutation({
    mutationFn: (values) =>
      post('/shop/contact', {
        name: values.name,
        phone: values.phone || null,
        email: values.email || null,
        subject: values.subject || null,
        message: values.message,
      }),
  })

  const onSubmit = async (values) => {
    try {
      await send.mutateAsync(values)

      setSent(true)
      reset()
    } catch (error) {
      if (error instanceof ApiError) {
        // 429 has no field to attach to -- it is about how often, not what.
        if (error.status === 429) {
          setError('message', {
            message: 'That is a lot of messages at once. Give it a minute and try again.',
          })

          return
        }

        applyServerErrors(error, setError, toast, { fallbackField: 'message' })
      } else {
        setError('message', { message: 'Could not send that. Please try again.' })
      }
    }
  }

  /*
   * The form is replaced by the confirmation rather than sitting under it.
   * Leaving an empty form below "thank you" reads as though it did not go.
   */
  if (sent) {
    return (
      <Card className="rise flex flex-col items-center gap-3 p-10 text-center">
        {/* The tick lands a beat after the card, so it reads as confirmation
            rather than as part of the furniture. */}
        <span
          style={{ animationDelay: '120ms' }}
          className="pop grid h-14 w-14 place-items-center rounded-full bg-success-50 text-success-700"
        >
          <CheckCircle2 className="h-7 w-7" aria-hidden="true" />
        </span>

        <p className="text-lg font-semibold text-ink-900">Your message has reached us</p>
        <p className="max-w-sm text-sm text-ink-600">
          We read everything that comes in and will get back to you on the number or address you
          left.
        </p>

        <Button variant="secondary" size="sm" onClick={() => setSent(false)}>
          Send another
        </Button>
      </Card>
    )
  }

  return (
    <Card className="rise h-full p-5 sm:p-6" style={{ animationDelay: '140ms' }}>
      <h2 className="text-base font-semibold text-ink-900">Send us a message</h2>
      <p className="mt-0.5 text-sm text-ink-600">
        We usually reply the same day.
      </p>

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="mt-5 flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Your name" htmlFor="name" error={errors.name?.message}>
            <input id="name" className={fieldClass} placeholder="Rahim Uddin" {...register('name')} />
          </FormField>

          <FormField label="Mobile number" htmlFor="phone" error={errors.phone?.message}>
            <input id="phone" className={fieldClass} placeholder="01712345678" {...register('phone')} />
          </FormField>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Email" htmlFor="email" error={errors.email?.message}>
            <input
              id="email"
              type="email"
              className={fieldClass}
              placeholder="you@example.com"
              {...register('email')}
            />
          </FormField>

          <FormField label="Subject" htmlFor="subject" error={errors.subject?.message}>
            <input
              id="subject"
              className={fieldClass}
              placeholder="Warranty, delivery, a product…"
              {...register('subject')}
            />
          </FormField>
        </div>

        <FormField label="Message" htmlFor="message" error={errors.message?.message}>
          <textarea
            id="message"
            rows={5}
            className={cx(fieldClass, 'h-auto py-2.5 leading-6')}
            placeholder="What can we help with?"
            {...register('message')}
          />
        </FormField>

        <div>
          <Button
            type="submit"
            loading={isSubmitting}
            className="group transition-transform active:scale-[0.98]"
          >
            <Send
              className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
              aria-hidden="true"
            />
            Send message
          </Button>
        </div>
      </form>
    </Card>
  )
}
