import { useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

import { ApiError } from '../../../lib/api'
import { initials } from '../../../lib/format'
import { useAuthStore } from '../../../stores/authStore'
import { useToast } from '../../../components/ui'
import { applyServerErrors } from '../applyServerErrors'
import { AccountButton, AccountField, Panel, fieldClass } from './shell'

/*
 * The account holds ONE name, because that is what an order is addressed to
 * and what the courier reads off the label. The design asks for two boxes,
 * so the form splits on the first space going in and joins on the way out.
 * Anything after the first space is the surname -- "Bessie Cooper" and
 * "Md. Abdur Rahman Khan" both survive the round trip unchanged.
 */
function splitName(full) {
  const parts = (full ?? '').trim().split(/\s+/).filter(Boolean)

  if (parts.length === 0) return { first: '', last: '' }

  return { first: parts[0], last: parts.slice(1).join(' ') }
}

const KEPT = 'You were given reward points for this, so it cannot be emptied.'

/*
 * Once the profile-completion bonus has been paid, the details it was paid
 * for stop being optional. The server is where that is enforced; this only
 * saves the shopper a round trip to find out.
 */
function buildSchema(locked) {
  const phone = z.string().regex(/^01[3-9]\d{8}$/, 'Enter a valid mobile number.')
  const birth = z.string()

  return z
    .object({
      first_name: z.string().min(1, 'Enter your first name.').max(60),
      last_name: z.string().max(60),
      email: z.string().email('Enter a valid email address.').or(z.literal('')),
      phone: locked ? phone : phone.or(z.literal('')),
      gender: z.enum(['', 'male', 'female', 'other']),
      date_of_birth: locked ? birth.min(1, KEPT) : birth.or(z.literal('')),
    })
    .refine((values) => values.phone !== '' || values.email !== '', {
      message: 'Keep at least one of mobile number or email address.',
      path: ['phone'],
    })
}

export function PersonalInformation() {
  const user = useAuthStore((state) => state.user)
  const updateProfile = useAuthStore((state) => state.updateProfile)
  const toast = useToast()

  const { first, last } = splitName(user?.name)
  const locked = user?.customer?.profile_locked === true
  const schema = useMemo(() => buildSchema(locked), [locked])

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting, isDirty },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      first_name: first,
      last_name: last,
      email: user?.email ?? '',
      phone: user?.phone ?? '',
      gender: user?.customer?.gender ?? '',
      // The API sends a full timestamp; <input type="date"> wants the date.
      date_of_birth: (user?.customer?.date_of_birth ?? '').slice(0, 10),
    },
  })

  const onSubmit = async (values) => {
    try {
      await updateProfile({
        name: [values.first_name, values.last_name].filter(Boolean).join(' ').trim(),
        email: values.email || null,
        phone: values.phone || null,
        gender: values.gender || null,
        date_of_birth: values.date_of_birth || null,
      })

      toast.success('Profile updated.')
    } catch (error) {
      if (error instanceof ApiError) {
        // The server names its field `name`; this form has two boxes for it,
        // so a complaint about the name belongs on the first of them.
        applyServerErrors(
          error,
          (field, detail) => setError(field === 'name' ? 'first_name' : field, detail),
          toast,
        )
        return
      }

      toast.error('Could not save your profile.')
    }
  }

  return (
    <Panel>
      {/*
         Initials, not an uploaded photo. There is no avatar column and no
         upload endpoint behind it, and a camera button that silently does
         nothing is worse than no camera button.
      */}
      <div className="mb-6 flex items-center gap-4">
        <div className="grid h-24 w-24 shrink-0 place-items-center rounded-full bg-brand-50 text-2xl font-bold text-brand-700 ring-1 ring-inset ring-brand-100">
          {initials(user?.name ?? '') || '—'}
        </div>

        <div className="min-w-0">
          <p className="truncate text-lg font-bold text-ink-900">{user?.name || 'Your account'}</p>
          {user?.customer?.code && (
            <p className="mt-0.5 text-sm text-ink-500">Customer {user.customer.code}</p>
          )}
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5" noValidate>
        <div className="grid gap-5 sm:grid-cols-2">
          <AccountField
            label="First Name"
            required
            placeholder="Ex. John"
            error={errors.first_name?.message}
            {...register('first_name')}
          />

          <AccountField
            label="Last Name"
            placeholder="Ex. Doe"
            error={errors.last_name?.message}
            {...register('last_name')}
          />
        </div>

        <AccountField
          label="Email"
          type="email"
          placeholder="example@gmail.com"
          error={errors.email?.message}
          {...register('email')}
        />

        <AccountField
          label="Phone"
          required={locked}
          inputMode="tel"
          placeholder="01XXXXXXXXX"
          hint={locked ? KEPT : undefined}
          error={errors.phone?.message}
          {...register('phone')}
        />

        <AccountField label="Gender" htmlFor="gender" error={errors.gender?.message}>
          <select id="gender" className={fieldClass} {...register('gender')}>
            <option value="">Prefer not to say</option>
            <option value="female">Female</option>
            <option value="male">Male</option>
            <option value="other">Other</option>
          </select>
        </AccountField>

        {/*
          The rewards program pays a bonus on a birthday, so without somewhere
          to enter one that bonus could never be earned.
        */}
        <AccountField
          label="Date of birth"
          htmlFor="date_of_birth"
          required={locked}
          hint={locked ? KEPT : undefined}
          error={errors.date_of_birth?.message}
        >
          <input
            id="date_of_birth"
            type="date"
            className={fieldClass}
            max={new Date().toISOString().slice(0, 10)}
            {...register('date_of_birth')}
          />
        </AccountField>

        <div>
          <AccountButton type="submit" disabled={isSubmitting || !isDirty}>
            {isSubmitting ? 'Saving…' : 'Update Changes'}
          </AccountButton>
        </div>
      </form>
    </Panel>
  )
}
