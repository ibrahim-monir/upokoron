import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { ApiError, del, get, post, put } from '../../../lib/api'
import { cx } from '../../../lib/format'
import { DistrictSelect } from '../../../components/DistrictSelect'
import { Spinner, useToast } from '../../../components/ui'
import { applyServerErrors } from '../applyServerErrors'
import { AccountButton, AccountField, Panel, fieldClass } from './shell'

/*
 * The fields are the ones a Bangladeshi parcel actually needs, not the
 * country/state/zip of the sample. District is picked from the list the
 * shop delivers to, because a typed district is a delivery charge waiting
 * to be wrong -- the API rejects anything off that list anyway.
 */
const schema = z.object({
  label: z.string().max(50),
  name: z.string().min(1, 'Enter the name for this address.').max(120),
  phone: z.string().regex(/^(\+?88)?01[3-9]\d{8}$/, 'Enter a valid mobile number.'),
  address_line1: z.string().min(1, 'Enter the street address.').max(200),
  address_line2: z.string().max(200),
  area: z.string().max(100),
  city: z.string().min(1, 'Enter the city or upazila.').max(100),
  district: z.string().min(1, 'Choose a district.'),
  postcode: z.string().max(20),
  is_default_shipping: z.boolean(),
})

const blank = {
  label: '',
  name: '',
  phone: '',
  address_line1: '',
  address_line2: '',
  area: '',
  city: '',
  district: '',
  postcode: '',
  is_default_shipping: false,
}

function useAddresses() {
  return useQuery({
    queryKey: ['shop', 'addresses'],
    queryFn: () => get('/shop/addresses'),
    select: (response) => response.data ?? [],
  })
}

function AddressForm({ editing, onDone }) {
  const toast = useToast()
  const queryClient = useQueryClient()

  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: editing ? { ...blank, ...editing } : blank,
  })

  const onSubmit = async (values) => {
    try {
      if (editing) await put(`/shop/addresses/${editing.id}`, values)
      else await post('/shop/addresses', values)

      queryClient.invalidateQueries({ queryKey: ['shop', 'addresses'] })
      toast.success(editing ? 'Address updated.' : 'Address added.')

      reset(blank)
      onDone()
    } catch (error) {
      if (error instanceof ApiError) {
        applyServerErrors(error, setError, toast)
        return
      }

      toast.error('Could not save this address.')
    }
  }

  return (
    <Panel title={editing ? 'Edit Address' : 'Add New Address'}>
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5" noValidate>
        <div className="grid gap-5 sm:grid-cols-2">
          <AccountField
            label="Full Name"
            required
            placeholder="Ex. Rahim Uddin"
            error={errors.name?.message}
            {...register('name')}
          />

          <AccountField
            label="Phone"
            required
            inputMode="tel"
            placeholder="01XXXXXXXXX"
            error={errors.phone?.message}
            {...register('phone')}
          />
        </div>

        <AccountField
          label="Label (Optional)"
          placeholder="Home, Office…"
          error={errors.label?.message}
          {...register('label')}
        />

        <AccountField
          label="Street Address"
          required
          placeholder="House, road, block"
          error={errors.address_line1?.message}
          {...register('address_line1')}
        />

        <AccountField
          label="Apartment, floor (Optional)"
          placeholder="Flat 4B"
          error={errors.address_line2?.message}
          {...register('address_line2')}
        />

        <div className="grid gap-5 sm:grid-cols-2">
          <AccountField
            label="Area (Optional)"
            placeholder="Ex. Dhanmondi"
            error={errors.area?.message}
            {...register('area')}
          />

          <AccountField
            label="City / Upazila"
            required
            placeholder="Ex. Dhaka"
            error={errors.city?.message}
            {...register('city')}
          />
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <AccountField label="District" required htmlFor="district" error={errors.district?.message}>
            <DistrictSelect
              id="district"
              className={cx(fieldClass, 'h-12 rounded-full')}
              invalid={Boolean(errors.district)}
              {...register('district')}
            />
          </AccountField>

          <AccountField
            label="Post Code (Optional)"
            placeholder="1207"
            error={errors.postcode?.message}
            {...register('postcode')}
          />
        </div>

        <label className="flex items-center gap-2.5 text-sm text-ink-700">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-ink-300 text-brand-600"
            {...register('is_default_shipping')}
          />
          Deliver to this address by default
        </label>

        <div className="flex flex-wrap gap-3">
          <AccountButton type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Saving…' : editing ? 'Save Address' : 'Add Address'}
          </AccountButton>

          {editing && (
            <AccountButton type="button" variant="outline" onClick={onDone}>
              Cancel
            </AccountButton>
          )}
        </div>
      </form>
    </Panel>
  )
}

export function ManageAddress() {
  const addresses = useAddresses()
  const queryClient = useQueryClient()
  const toast = useToast()
  const [editing, setEditing] = useState(null)

  const remove = useMutation({
    mutationFn: (id) => del(`/shop/addresses/${id}`),
    onSuccess() {
      queryClient.invalidateQueries({ queryKey: ['shop', 'addresses'] })
      toast.success('Address removed.')
    },
    onError: (error) => toast.error(error?.message ?? 'Could not remove this address.'),
  })

  const rows = addresses.data ?? []

  return (
    <div className="flex flex-col gap-5">
      <Panel title="Saved addresses" description="Where your orders are delivered.">
        {addresses.isLoading ? (
          <div className="grid place-items-center py-8">
            <Spinner />
          </div>
        ) : rows.length === 0 ? (
          <p className="py-4 text-sm text-ink-500">
            No saved addresses yet. Add one below and checkout will offer it.
          </p>
        ) : (
          <ul className="divide-y divide-ink-100">
            {rows.map((address) => (
              <li key={address.id} className="flex flex-wrap items-start gap-4 py-4 first:pt-0">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-bold text-ink-900">{address.name}</p>

                    {address.label && (
                      <span className="rounded-full bg-ink-100 px-2 py-0.5 text-[11px] font-semibold text-ink-600">
                        {address.label}
                      </span>
                    )}

                    {address.is_default_shipping && (
                      <span className="rounded-full bg-accent-50 px-2 py-0.5 text-[11px] font-semibold text-accent-700">
                        Default
                      </span>
                    )}
                  </div>

                  <p className="mt-1 text-sm text-ink-600">
                    {[
                      address.address_line1,
                      address.address_line2,
                      address.area,
                      address.city,
                      address.district,
                      address.postcode,
                    ]
                      .filter(Boolean)
                      .join(', ')}
                  </p>

                  <p className="mt-0.5 text-sm tabular text-ink-500">{address.phone}</p>
                </div>

                <div className="flex shrink-0 items-center gap-4">
                  <button
                    type="button"
                    onClick={() => setEditing(address)}
                    className="text-sm font-semibold text-ink-700 hover:text-brand-800"
                  >
                    Edit
                  </button>

                  <button
                    type="button"
                    disabled={remove.isPending}
                    onClick={() => {
                      if (window.confirm(`Remove this address for ${address.name}?`)) {
                        remove.mutate(address.id)
                      }
                    }}
                    className="text-sm font-semibold text-danger-700 hover:text-danger-500 disabled:opacity-50"
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <AddressForm
        // Remounts on a different address, so the inputs reload their values.
        key={editing?.id ?? 'new'}
        editing={editing}
        onDone={() => setEditing(null)}
      />
    </div>
  )
}
