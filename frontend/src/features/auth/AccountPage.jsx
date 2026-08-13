import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { put } from '../../lib/api'
import { ApiError } from '../../lib/api'
import { useAuthStore } from '../../stores/authStore'
import { Button, Card, CardHeader, Field, useToast } from '../../components/ui'
import { applyServerErrors } from './applyServerErrors'

const profileSchema = z
  .object({
    name: z.string().min(1, 'Enter your name.').max(120),
    phone: z
      .string()
      .regex(/^01[3-9]\d{8}$/, 'Enter a valid mobile number.')
      .or(z.literal('')),
    email: z.string().email('Enter a valid email address.').or(z.literal('')),
  })
  .refine((values) => values.phone !== '' || values.email !== '', {
    message: 'Keep at least one of mobile number or email address.',
    path: ['phone'],
  })

const passwordSchema = z
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

function ProfileForm() {
  const user = useAuthStore((state) => state.user)
  const updateProfile = useAuthStore((state) => state.updateProfile)
  const toast = useToast()

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting, isDirty },
  } = useForm({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      name: user?.name ?? '',
      phone: user?.phone ?? '',
      email: user?.email ?? '',
    },
  })

  const onSubmit = async (values) => {
    try {
      await updateProfile({
        ...values,
        phone: values.phone || null,
        email: values.email || null,
      })

      toast.success('Profile updated.')
    } catch (error) {
      if (error instanceof ApiError) {
        applyServerErrors(error, setError, toast)
        return
      }

      toast.error('Could not save your profile.')
    }
  }

  return (
    <Card>
      <CardHeader title="Your details" description="How we reach you about orders." />

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4 p-4" noValidate>
        <Field label="Full name" required error={errors.name?.message} {...register('name')} />
        <Field label="Mobile number" error={errors.phone?.message} {...register('phone')} />
        <Field label="Email address" type="email" error={errors.email?.message} {...register('email')} />

        <div>
          <Button type="submit" loading={isSubmitting} disabled={!isDirty}>
            Save changes
          </Button>
        </div>
      </form>
    </Card>
  )
}

function PasswordForm() {
  const toast = useToast()

  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(passwordSchema),
    defaultValues: { current_password: '', password: '', password_confirmation: '' },
  })

  const onSubmit = async (values) => {
    try {
      await put('/shop/auth/password', values)

      // The server revokes every other token on a password change, so say so.
      toast.success('Password changed. Other devices have been signed out.')
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
    <Card>
      <CardHeader
        title="Password"
        description="Changing this signs you out everywhere else."
      />

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4 p-4" noValidate>
        <Field
          label="Current password"
          required
          type="password"
          autoComplete="current-password"
          error={errors.current_password?.message}
          {...register('current_password')}
        />

        <Field
          label="New password"
          required
          type="password"
          autoComplete="new-password"
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

        <div>
          <Button type="submit" loading={isSubmitting}>
            Change password
          </Button>
        </div>
      </form>
    </Card>
  )
}

export function AccountPage() {
  const user = useAuthStore((state) => state.user)

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink-900">My account</h1>
        <p className="mt-1 text-sm text-ink-500">
          {user?.customer?.code ? `Customer ${user.customer.code}` : 'Your profile and password.'}
        </p>
      </div>

      <ProfileForm />
      <PasswordForm />
    </div>
  )
}
