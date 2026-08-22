import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Cake,
  Gift,
  Minus,
  Plus,
  ShoppingBag,
  Star,
  Timer,
  UserCheck,
} from 'lucide-react'
import { put } from '../../lib/api'
import { ApiError } from '../../lib/api'
import { cx } from '../../lib/format'
import { useAuthStore } from '../../stores/authStore'
import { Button, Card, CardHeader, ErrorState, Field, Pagination, Spinner, useToast } from '../../components/ui'
import { applyServerErrors } from './applyServerErrors'
import { useRewardHistory } from './useRewardHistory'

const TYPE_META = {
  purchase: { icon: ShoppingBag, shell: 'bg-success-50 text-success-700' },
  review: { icon: Star, shell: 'bg-success-50 text-success-700' },
  profile_completion: { icon: UserCheck, shell: 'bg-success-50 text-success-700' },
  birthday: { icon: Cake, shell: 'bg-success-50 text-success-700' },
  manual_credit: { icon: Plus, shell: 'bg-success-50 text-success-700' },
  manual_debit: { icon: Minus, shell: 'bg-danger-50 text-danger-700' },
  redeemed: { icon: Gift, shell: 'bg-brand-50 text-brand-700' },
  expired: { icon: Timer, shell: 'bg-ink-100 text-ink-500' },
}

function RewardHistoryRow({ transaction }) {
  const meta = TYPE_META[transaction.type] ?? { icon: Gift, shell: 'bg-ink-100 text-ink-500' }
  const Icon = meta.icon
  const positive = transaction.points > 0

  return (
    <li className="flex items-center gap-3 border-b border-ink-100 py-3 last:border-0">
      <span className={cx('grid h-9 w-9 shrink-0 place-items-center rounded-full', meta.shell)}>
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-ink-900">{transaction.type_label}</p>
        <p className="mt-0.5 truncate text-xs text-ink-500">
          {transaction.note}
          {transaction.order_number && ` · Order ${transaction.order_number}`}
        </p>
        <p className="text-xs text-ink-400">
          {transaction.created_at ? new Date(transaction.created_at).toLocaleDateString() : ''}
        </p>
      </div>

      <span className={cx('tabular shrink-0 text-sm font-bold', positive ? 'text-success-700' : 'text-danger-700')}>
        {positive ? '+' : ''}
        {transaction.points}
      </span>
    </li>
  )
}

function RewardPointsCard() {
  const [page, setPage] = useState(1)
  const query = useRewardHistory(page)

  const balance = query.data?.balance ?? 0
  const rows = query.data?.data ?? []

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-3 p-4">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-600">
          <Gift className="h-5 w-5" aria-hidden="true" />
        </span>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-ink-500">Reward points</p>
          <p className="text-xl font-bold tabular text-ink-900">{balance}</p>
        </div>
      </div>

      <div className="border-t border-ink-100 px-4">
        {query.isLoading ? (
          <div className="grid place-items-center py-8">
            <Spinner />
          </div>
        ) : query.isError ? (
          <div className="py-4">
            <ErrorState error={query.error} onRetry={query.refetch} />
          </div>
        ) : rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-500">No point activity yet.</p>
        ) : (
          <ul>
            {rows.map((transaction) => (
              <RewardHistoryRow key={transaction.id} transaction={transaction} />
            ))}
          </ul>
        )}
      </div>

      {rows.length > 0 && (
        <div className="border-t border-ink-100 px-4">
          <Pagination meta={query.data?.meta} onPage={setPage} />
        </div>
      )}
    </Card>
  )
}

const profileSchema = z
  .object({
    name: z.string().min(1, 'Enter your name.').max(120),
    phone: z
      .string()
      .regex(/^01[3-9]\d{8}$/, 'Enter a valid mobile number.')
      .or(z.literal('')),
    email: z.string().email('Enter a valid email address.').or(z.literal('')),
    date_of_birth: z.string().or(z.literal('')),
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
      date_of_birth: user?.customer?.date_of_birth ?? '',
    },
  })

  const onSubmit = async (values) => {
    try {
      await updateProfile({
        ...values,
        phone: values.phone || null,
        email: values.email || null,
        date_of_birth: values.date_of_birth || null,
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
        <Field
          label="Date of birth"
          type="date"
          hint="Adding this earns a one-time reward points bonus once your profile is complete."
          error={errors.date_of_birth?.message}
          {...register('date_of_birth')}
        />

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

      {user?.customer && <RewardPointsCard />}

      <ProfileForm />
      <PasswordForm />
    </div>
  )
}
