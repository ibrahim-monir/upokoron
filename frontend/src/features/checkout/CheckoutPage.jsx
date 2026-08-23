import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { AlertTriangle, Check, ShoppingBag, Truck } from 'lucide-react'
import { cx, money } from '../../lib/format'
import { Button, EmptyState, ErrorState, Field, Spinner, useToast } from '../../components/ui'
import { DistrictSelect } from '../../components/DistrictSelect'
import { useCheckout, usePlaceOrder, useShippingOptions } from './useCheckout'

/** A selectable card. Used for addresses, delivery options and payment. */
function Choice({ selected, onSelect, disabled, children }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      className={cx(
        'w-full rounded-card border-2 p-3 text-left transition-colors disabled:opacity-50',
        selected ? 'border-brand-600 bg-brand-50' : 'border-ink-200 bg-white enabled:hover:border-brand-300',
      )}
    >
      {children}
    </button>
  )
}

function Section({ step, title, children }) {
  return (
    <section className="rounded-card border border-ink-200 bg-white p-4">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink-900">
        <span className="grid h-6 w-6 place-items-center rounded-full bg-brand-600 text-xs font-bold text-white">
          {step}
        </span>
        {title}
      </h2>
      {children}
    </section>
  )
}

export function CheckoutPage() {
  const toast = useToast()
  const navigate = useNavigate()

  const checkout = useCheckout()
  const shippingOptions = useShippingOptions()
  const placeOrder = usePlaceOrder()

  const [addressId, setAddressId] = useState(null)
  const [rateId, setRateId] = useState(null)
  const [methodId, setMethodId] = useState(null)

  const form = useForm({
    defaultValues: {
      name: '',
      phone: '',
      address_line1: '',
      address_line2: '',
      area: '',
      city: '',
      district: '',
      customer_note: '',
    },
  })

  const data = checkout.data
  const addresses = data?.addresses ?? []
  const methods = data?.payment_methods ?? []

  const selectedAddress = addresses.find((a) => a.id === addressId) ?? null
  const method = methods.find((m) => m.id === methodId) ?? null

  // Preselect the customer's default address and the first payment method,
  // so a returning customer can place an order without touching anything.
  useEffect(() => {
    if (addressId === null && addresses.length > 0) {
      setAddressId((addresses.find((a) => a.is_default_shipping) ?? addresses[0]).id)
    }
  }, [addresses, addressId])

  useEffect(() => {
    if (methodId === null && methods.length > 0) setMethodId(methods[0].id)
  }, [methods, methodId])

  // Where the parcel is going, whichever way the address was given.
  const district = selectedAddress?.district ?? form.watch('district')
  const city = selectedAddress?.city ?? form.watch('city')

  /*
   * Re-quote delivery whenever the destination or the payment method
   * changes. COD is passed along because a courier that will not collect
   * cash in a district makes COD impossible there, whatever the shop's
   * payment settings say.
   */
  useEffect(() => {
    if (!district) return

    const timer = setTimeout(() => {
      shippingOptions.mutate(
        { district, city: city || '', cod: method?.is_cod ?? false },
        { onSuccess: (result) => setRateId(result.options?.[0]?.id ?? null) },
      )
    }, 400)

    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [district, city, method?.is_cod])

  const options = shippingOptions.data?.options ?? []
  const rate = options.find((o) => o.id === rateId) ?? null

  const coupon = data?.coupon ?? null
  const couponDiscount = coupon?.is_valid ? Number(coupon.discount) : 0
  const rewardPoints = data?.reward_points ?? null
  const rewardPointsDiscount = rewardPoints?.is_valid ? Number(rewardPoints.discount) : 0

  const totals = useMemo(() => {
    const subtotal = Number(data?.subtotal ?? 0)
    const delivery = Number(rate?.charge ?? 0)
    const extra = Number(method?.extra_charge ?? 0)

    // `subtotal` is already net of item-level discounts; only the coupon,
    // redeemed points, and delivery subtract further here.
    return {
      subtotal,
      delivery,
      extra,
      total: subtotal - couponDiscount - rewardPointsDiscount + delivery + extra,
    }
  }, [data?.subtotal, rate?.charge, method?.extra_charge, couponDiscount, rewardPointsDiscount])

  const submit = form.handleSubmit((values) => {
    if (!rateId) {
      toast.error('Choose a delivery option first.')
      return
    }

    if (coupon && !coupon.is_valid) {
      toast.error(coupon.message ?? 'That coupon no longer applies. Remove it in your cart and try again.')
      return
    }

    if (rewardPoints && !rewardPoints.is_valid) {
      toast.error(rewardPoints.message ?? 'That points redemption no longer applies. Remove it in your cart and try again.')
      return
    }

    const payload = {
      shipping_rate_id: rateId,
      payment_method_id: methodId,
      customer_note: values.customer_note || null,
    }

    if (selectedAddress) {
      payload.customer_address_id = selectedAddress.id
    } else {
      payload.address = {
        name: values.name,
        phone: values.phone,
        address_line1: values.address_line1,
        address_line2: values.address_line2 || null,
        area: values.area || null,
        city: values.city,
        district: values.district,
      }
    }

    // The phone travels to the confirmation page so a guest -- who has no
    // session to be recognised by -- can actually see the order they just
    // placed instead of being bounced to a login screen.
    const phone = selectedAddress?.phone ?? values.phone

    placeOrder.mutate(payload, {
      onSuccess: (order) =>
        navigate(`/order-complete/${order.number}?phone=${encodeURIComponent(phone)}`),
      onError: (error) => {
        // 422 puts the message on the field it belongs to; anything else is a
        // business rule -- out of stock, address not covered -- and belongs
        // at the top where it will actually be read.
        if (error?.isValidation) {
          Object.entries(error.fieldErrors()).forEach(([field, message]) => {
            form.setError(field.replace('address.', ''), { message })
          })
        }

        toast.error(error?.message ?? 'Could not place the order.')
      },
    })
  })

  if (checkout.isLoading) {
    return (
      <div className="grid place-items-center py-24">
        <Spinner />
      </div>
    )
  }

  if (checkout.isError) return <ErrorState error={checkout.error} onRetry={checkout.refetch} />

  if ((data?.item_count ?? 0) === 0) {
    return (
      <div className="rounded-card border border-ink-200 bg-white">
        <EmptyState
          icon={ShoppingBag}
          title="Nothing to check out"
          description="Your cart is empty."
          action={
            <Link
              to="/products"
              className="inline-block rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
            >
              Start shopping
            </Link>
          }
        />
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-ink-900">Checkout</h1>

      {data.has_unheld_items && (
        <div className="flex items-start gap-2 rounded-card border border-warning-500/40 bg-warning-50 p-3 text-sm text-warning-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p>
            Some items are no longer reserved for you.{' '}
            <Link to="/cart" className="font-semibold underline">
              Open your cart
            </Link>{' '}
            and adjust them before ordering.
          </p>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <div className="flex flex-col gap-4">
          <Section step="1" title="Delivery address">
            {addresses.length > 0 && (
              <div className="mb-3 grid gap-2 sm:grid-cols-2">
                {addresses.map((address) => (
                  <Choice
                    key={address.id}
                    selected={address.id === addressId}
                    onSelect={() => setAddressId(address.id)}
                  >
                    <p className="text-sm font-medium text-ink-900">
                      {address.name}
                      {address.label && <span className="ml-2 text-xs text-ink-500">{address.label}</span>}
                    </p>
                    <p className="mt-0.5 text-sm text-ink-600">{address.phone}</p>
                    <p className="text-sm text-ink-600">
                      {[address.address_line1, address.area, address.city, address.district]
                        .filter(Boolean)
                        .join(', ')}
                    </p>
                  </Choice>
                ))}

                <Choice selected={addressId === null} onSelect={() => setAddressId(null)}>
                  <p className="text-sm font-medium text-ink-900">Deliver somewhere else</p>
                  <p className="mt-0.5 text-sm text-ink-500">Enter a new address</p>
                </Choice>
              </div>
            )}

            {addressId === null && (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field
                  label="Full name"
                  required
                  error={form.formState.errors.name?.message}
                  {...form.register('name', { required: 'Your name is required.' })}
                />

                <Field
                  label="Mobile number"
                  required
                  placeholder="01XXXXXXXXX"
                  inputMode="tel"
                  error={form.formState.errors.phone?.message}
                  {...form.register('phone', {
                    required: 'A mobile number is required.',
                    pattern: {
                      value: /^(\+?88)?01[3-9]\d{8}$/,
                      message: 'Enter a valid Bangladeshi mobile number.',
                    },
                  })}
                />

                <Field
                  className="sm:col-span-2"
                  label="Address"
                  required
                  placeholder="House, road, block"
                  error={form.formState.errors.address_line1?.message}
                  {...form.register('address_line1', { required: 'An address is required.' })}
                />

                <Field label="Area (optional)" placeholder="Mirpur, Uttara…" {...form.register('area')} />

                <Field
                  label="City"
                  required
                  error={form.formState.errors.city?.message}
                  {...form.register('city', { required: 'A city is required.' })}
                />

                {/*
                  Chosen, not typed. The district decides the delivery charge,
                  and a spelling no zone matches would quietly bill the
                  customer for the far side of the country.
                */}
                <Field label="District" required error={form.formState.errors.district?.message}>
                  {({ id: fieldId, invalid }) => (
                    <DistrictSelect
                      id={fieldId}
                      invalid={invalid}
                      {...form.register('district', { required: 'Choose your district.' })}
                    />
                  )}
                </Field>
              </div>
            )}
          </Section>

          <Section step="2" title="Delivery option">
            {!district ? (
              <p className="text-sm text-ink-500">Enter a district above to see delivery options.</p>
            ) : shippingOptions.isPending ? (
              <div className="flex items-center gap-2 text-sm text-ink-500">
                <Spinner className="h-4 w-4" /> Checking delivery to {district}…
              </div>
            ) : options.length === 0 ? (
              <p className="text-sm text-danger-700">
                No delivery option covers that address with this payment method.
              </p>
            ) : (
              <div className="grid gap-2">
                {options.map((option) => (
                  <Choice key={option.id} selected={option.id === rateId} onSelect={() => setRateId(option.id)}>
                    <div className="flex items-baseline justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-ink-900">
                          {option.name}
                          {shippingOptions.data?.zone?.name && (
                            <span className="ml-2 text-xs text-ink-500">
                              {shippingOptions.data.zone.name}
                            </span>
                          )}
                        </p>
                        {option.estimate && <p className="text-xs text-ink-500">{option.estimate}</p>}
                      </div>
                      <span className="tabular text-sm font-semibold text-brand-800">
                        {option.is_free ? 'Free' : money(option.charge)}
                      </span>
                    </div>
                  </Choice>
                ))}
              </div>
            )}
          </Section>

          <Section step="3" title="Payment">
            <div className="grid gap-2">
              {methods.map((paymentMethod) => (
                <Choice
                  key={paymentMethod.id}
                  selected={paymentMethod.id === methodId}
                  onSelect={() => setMethodId(paymentMethod.id)}
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="text-sm font-medium text-ink-900">{paymentMethod.name}</p>
                    {Number(paymentMethod.extra_charge) > 0 && (
                      <span className="tabular text-xs text-ink-500">
                        + {money(paymentMethod.extra_charge)}
                      </span>
                    )}
                  </div>
                  {paymentMethod.id === methodId && paymentMethod.instructions && (
                    <p className="mt-1.5 text-sm text-ink-600">{paymentMethod.instructions}</p>
                  )}
                </Choice>
              ))}
            </div>

            <Field
              className="mt-3"
              label="Note for us (optional)"
              placeholder="Any delivery instructions"
              {...form.register('customer_note')}
            />
          </Section>
        </div>

        <div className="flex flex-col gap-4 lg:sticky lg:top-20 lg:self-start">
          <div className="rounded-card border border-ink-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-ink-900">Order summary</h2>

            <ul className="mt-3 flex flex-col gap-2 border-b border-ink-100 pb-3">
              {(data.items ?? []).map((line) => (
                <li key={line.id} className="flex justify-between gap-3 text-sm">
                  <span className="min-w-0 text-ink-700">
                    <span className="line-clamp-1">{line.name}</span>
                    <span className="text-xs text-ink-500">× {Number(line.quantity)}</span>
                  </span>
                  <span className="tabular shrink-0 text-ink-900">{money(line.line_total)}</span>
                </li>
              ))}
            </ul>

            <dl className="mt-3 flex flex-col gap-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-ink-600">Subtotal</dt>
                <dd className="tabular text-ink-900">{money(totals.subtotal)}</dd>
              </div>

              {coupon && (
                <div className="flex justify-between">
                  <dt className={coupon.is_valid ? 'text-ink-600' : 'text-warning-700'}>
                    Coupon ({coupon.code})
                  </dt>
                  <dd className={cx('tabular', coupon.is_valid ? 'text-accent-600' : 'text-warning-700')}>
                    {coupon.is_valid ? `− ${money(couponDiscount)}` : (coupon.message ?? 'no longer applies')}
                  </dd>
                </div>
              )}

              {rewardPoints && (
                <div className="flex justify-between">
                  <dt className={rewardPoints.is_valid ? 'text-ink-600' : 'text-warning-700'}>
                    Points ({rewardPoints.points})
                  </dt>
                  <dd className={cx('tabular', rewardPoints.is_valid ? 'text-accent-600' : 'text-warning-700')}>
                    {rewardPoints.is_valid
                      ? `− ${money(rewardPointsDiscount)}`
                      : (rewardPoints.message ?? 'no longer applies')}
                  </dd>
                </div>
              )}

              <div className="flex justify-between">
                <dt className="text-ink-600">Delivery</dt>
                <dd className="tabular text-ink-900">
                  {rate ? (rate.is_free ? 'Free' : money(totals.delivery)) : '—'}
                </dd>
              </div>

              {totals.extra > 0 && (
                <div className="flex justify-between">
                  <dt className="text-ink-600">Payment charge</dt>
                  <dd className="tabular text-ink-900">{money(totals.extra)}</dd>
                </div>
              )}

              <div className="flex justify-between border-t border-ink-100 pt-2 text-base font-semibold">
                <dt className="text-ink-900">Total</dt>
                <dd className="tabular text-brand-800">{money(totals.total)}</dd>
              </div>
            </dl>

            {/*
              The figures above are for the shopper's benefit. The order is
              priced again on the server from the cart and the catalogue, so
              what is charged cannot differ from what the shop offers -- not
              even if this page is edited in a browser.
            */}
            <Button
              type="submit"
              className="mt-4 w-full"
              loading={placeOrder.isPending}
              disabled={
                !rateId ||
                !methodId ||
                data.has_unheld_items ||
                (coupon && !coupon.is_valid) ||
                (rewardPoints && !rewardPoints.is_valid)
              }
            >
              <Check className="h-4 w-4" aria-hidden="true" />
              Place order
            </Button>

            {method?.is_cod && (
              <p className="mt-2 flex items-start gap-1.5 text-xs text-ink-500">
                <Truck className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                Pay {money(totals.total)} to the courier when your order arrives.
              </p>
            )}
          </div>
        </div>
      </div>
    </form>
  )
}
