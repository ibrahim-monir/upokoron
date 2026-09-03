import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { AlertTriangle, Check, Copy, ShoppingBag, Truck } from 'lucide-react'
import { cx, money } from '../../lib/format'
import { useTranslation } from '../../lib/i18n'
import { Button, EmptyState, ErrorState, Field, Spinner, useToast } from '../../components/ui'
import { CheckoutSteps } from '../../components/CheckoutSteps'
import { DistrictSelect } from '../../components/DistrictSelect'
import { CouponBox, RewardPointsBox } from '../cart/RewardFields'
import { useCheckout, usePlaceOrder, useShippingOptions } from './useCheckout'

/**
 * A selectable card. Used for addresses, delivery options and payment.
 *
 * `footer` is for content the card must hold but the BUTTON must not: a text
 * input inside a <button> is invalid HTML, and browsers deal with it by
 * eating the clicks meant for the input. So a card with a footer stops being
 * a button and grows one instead, with the footer as its sibling -- same
 * border, same fill, still one card to look at.
 */
function Choice({ selected, onSelect, disabled, footer, children }) {
  // The same card either way; all that changes is which element owns the
  // border -- the button itself, or the wrapper the button sits in.
  const card = cx(
    'w-full rounded-card border-2 text-left transition-colors',
    selected ? 'border-brand-600 bg-brand-50' : 'border-ink-200 bg-white',
  )

  const label = (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      className={cx(
        'w-full p-3 text-left disabled:opacity-50',
        !footer && card,
        !footer && !selected && 'enabled:hover:border-brand-300',
      )}
    >
      {children}
    </button>
  )

  if (!footer) return label

  return (
    <div className={cx(card, !selected && 'hover:border-brand-300')}>
      {label}
      <div className="px-3 pb-3">{footer}</div>
    </div>
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
  const { t } = useTranslation()
  const toast = useToast()
  const navigate = useNavigate()

  const checkout = useCheckout()
  const shippingOptions = useShippingOptions()
  const placeOrder = usePlaceOrder()

  const [addressId, setAddressId] = useState(null)
  const [rateId, setRateId] = useState(null)
  const [methodId, setMethodId] = useState(null)

  const copyReceiveNumber = (number) => {
    navigator.clipboard
      .writeText(number)
      .then(() => toast.success(t('checkout.numberCopied')))
      .catch(() => toast.error(t('checkout.copyFailed')))
  }

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
      payment_reference: '',
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
      toast.error(t('checkout.chooseDeliveryFirst'))
      return
    }

    if (coupon && !coupon.is_valid) {
      toast.error(coupon.message ?? t('checkout.couponExpired'))
      return
    }

    if (rewardPoints && !rewardPoints.is_valid) {
      toast.error(rewardPoints.message ?? t('checkout.pointsExpired'))
      return
    }

    const payload = {
      shipping_rate_id: rateId,
      payment_method_id: methodId,
      customer_note: values.customer_note || null,

      // Only ever sent for a method the customer settles themselves, and
      // optional even then -- most people pay after reading the confirmation
      // page, and there is a box for it there too.
      payment_reference: method?.collects_reference ? values.payment_reference || null : null,
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

        toast.error(error?.message ?? t('checkout.placeOrderFailed'))
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
      <div className="flex flex-col gap-4">
        <CheckoutSteps current="checkout" />

        <div className="rounded-card border border-ink-200 bg-white">
          <EmptyState
            icon={ShoppingBag}
            title={t('checkout.empty')}
            description={t('checkout.emptyBody')}
            action={
              <Link
                to="/products"
                className="inline-block rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
              >
                {t('cart.startShopping')}
              </Link>
            }
          />
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <CheckoutSteps current="checkout" />

      <h1 className="text-xl font-semibold text-ink-900">{t('checkout.title')}</h1>

      {data.has_unheld_items && (
        <div className="flex items-start gap-2 rounded-card border border-warning-500/40 bg-warning-50 p-3 text-sm text-warning-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p>
            {t('checkout.unheldWarning1')}{' '}
            <Link to="/cart" className="font-semibold underline">
              {t('checkout.openYourCart')}
            </Link>{' '}
            {t('checkout.unheldWarning2')}
          </p>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <div className="flex flex-col gap-4">
          <Section step="1" title={t('checkout.deliveryAddress')}>
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
                  <p className="text-sm font-medium text-ink-900">{t('checkout.deliverElsewhere')}</p>
                  <p className="mt-0.5 text-sm text-ink-500">{t('checkout.enterNewAddress')}</p>
                </Choice>
              </div>
            )}

            {addressId === null && (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field
                  label={t('checkout.fullName')}
                  required
                  error={form.formState.errors.name?.message}
                  {...form.register('name', { required: t('checkout.nameRequired') })}
                />

                <Field
                  label={t('checkout.mobileNumber')}
                  required
                  placeholder="01XXXXXXXXX"
                  inputMode="tel"
                  error={form.formState.errors.phone?.message}
                  {...form.register('phone', {
                    required: t('checkout.mobileRequired'),
                    pattern: {
                      value: /^(\+?88)?01[3-9]\d{8}$/,
                      message: t('checkout.mobileInvalid'),
                    },
                  })}
                />

                <Field
                  className="sm:col-span-2"
                  label={t('checkout.address')}
                  required
                  placeholder={t('checkout.addressPlaceholder')}
                  error={form.formState.errors.address_line1?.message}
                  {...form.register('address_line1', { required: t('checkout.addressRequired') })}
                />

                <Field label={t('checkout.area')} placeholder={t('checkout.areaPlaceholder')} {...form.register('area')} />

                <Field
                  label={t('checkout.city')}
                  required
                  error={form.formState.errors.city?.message}
                  {...form.register('city', { required: t('checkout.cityRequired') })}
                />

                {/*
                  Chosen, not typed. The district decides the delivery charge,
                  and a spelling no zone matches would quietly bill the
                  customer for the far side of the country.
                */}
                <Field label={t('checkout.district')} required error={form.formState.errors.district?.message}>
                  {({ id: fieldId, invalid }) => (
                    <DistrictSelect
                      id={fieldId}
                      invalid={invalid}
                      {...form.register('district', { required: t('checkout.districtRequired') })}
                    />
                  )}
                </Field>
              </div>
            )}
          </Section>

          <div className="grid gap-4 md:grid-cols-2">
            <Section step="2" title={t('checkout.deliveryOption')}>
              {!district ? (
                <p className="text-sm text-ink-500">{t('checkout.enterDistrictFirst')}</p>
              ) : shippingOptions.isPending ? (
                <div className="flex items-center gap-2 text-sm text-ink-500">
                  <Spinner className="h-4 w-4" /> {t('checkout.checkingDelivery', { district })}
                </div>
              ) : options.length === 0 ? (
                <p className="text-sm text-danger-700">{t('checkout.noDeliveryOption')}</p>
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
                          {option.is_free ? t('checkout.free') : money(option.charge)}
                        </span>
                      </div>
                    </Choice>
                  ))}
                </div>
              )}
            </Section>

            <Section step="3" title={t('checkout.payment')}>
              <div className="grid gap-2">
                {methods.map((paymentMethod) => (
                  <Choice
                    key={paymentMethod.id}
                    selected={paymentMethod.id === methodId}
                    onSelect={() => setMethodId(paymentMethod.id)}
                    // Only the chosen method asks for an id, and only a method
                    // the customer settles themselves has one to ask for. Three
                    // boxes open at once would be three chances to type the
                    // number into the wrong wallet.
                    footer={
                      paymentMethod.id === methodId && paymentMethod.collects_reference ? (
                        <Field
                          label={t('checkout.transactionId')}
                          hint={
                            paymentMethod.receive_number
                              ? t('checkout.transactionIdHintSent', { number: paymentMethod.receive_number })
                              : t('checkout.transactionIdHint')
                          }
                          placeholder={t('checkout.transactionIdPlaceholder')}
                          {...form.register('payment_reference')}
                        />
                      ) : null
                    }
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="text-sm font-medium text-ink-900">{paymentMethod.name}</p>
                      {Number(paymentMethod.extra_charge) > 0 && (
                        <span className="tabular text-xs text-ink-500">
                          + {money(paymentMethod.extra_charge)}
                        </span>
                      )}
                    </div>
                    {paymentMethod.id === methodId && paymentMethod.receive_number && (
                      <div className="mt-1.5 flex items-center gap-2 rounded-lg bg-brand-50 px-3 py-2">
                        <span className="text-sm text-ink-600">{t('checkout.sendPaymentTo')}</span>
                        <span className="tabular text-sm font-semibold text-brand-800">
                          {paymentMethod.receive_number}
                        </span>
                        {/*
                          A <span>, not a <button> -- Choice above is itself a
                          button, and a button cannot contain another one
                          without the browser silently breaking the nesting.
                          role="button" + a key handler keep it as reachable
                          and operable as a real button would be.
                        */}
                        <span
                          role="button"
                          tabIndex={0}
                          onClick={(event) => {
                            event.stopPropagation()
                            copyReceiveNumber(paymentMethod.receive_number)
                          }}
                          onKeyDown={(event) => {
                            if (event.key !== 'Enter' && event.key !== ' ') return
                            event.preventDefault()
                            event.stopPropagation()
                            copyReceiveNumber(paymentMethod.receive_number)
                          }}
                          aria-label={t('checkout.copyReceiveNumber')}
                          className="ml-auto grid h-6 w-6 shrink-0 cursor-pointer place-items-center rounded text-brand-700 hover:bg-brand-100"
                        >
                          <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                        </span>
                      </div>
                    )}

                    {paymentMethod.id === methodId && paymentMethod.instructions && (
                      <p className="mt-1.5 text-sm text-ink-600">{paymentMethod.instructions}</p>
                    )}
                  </Choice>
                ))}
              </div>

              <Field
                className="mt-3"
                label={t('checkout.noteForUs')}
                placeholder={t('checkout.deliveryInstructions')}
                {...form.register('customer_note')}
              />
            </Section>
          </div>
        </div>

        <div className="flex flex-col gap-4 lg:sticky lg:top-20 lg:self-start">
          <div className="rounded-card border border-ink-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-ink-900">{t('checkout.orderSummary')}</h2>

            <div className="mt-3 flex flex-col gap-2">
              <CouponBox coupon={coupon} />
              <RewardPointsBox rewardPoints={rewardPoints} balance={Number(data.reward_points_balance ?? 0)} />
            </div>

            <ul className="mt-3 flex flex-col gap-2 border-t border-ink-100 pb-3 pt-3">
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
                <dt className="text-ink-600">{t('checkout.subtotal')}</dt>
                <dd className="tabular text-ink-900">{money(totals.subtotal)}</dd>
              </div>

              {coupon && (
                <div className="flex justify-between">
                  <dt className={coupon.is_valid ? 'text-ink-600' : 'text-warning-700'}>
                    {t('checkout.couponLabel', { code: coupon.code })}
                  </dt>
                  <dd className={cx('tabular', coupon.is_valid ? 'text-accent-600' : 'text-warning-700')}>
                    {coupon.is_valid ? `− ${money(couponDiscount)}` : (coupon.message ?? t('checkout.noLongerApplies'))}
                  </dd>
                </div>
              )}

              {rewardPoints && (
                <div className="flex justify-between">
                  <dt className={rewardPoints.is_valid ? 'text-ink-600' : 'text-warning-700'}>
                    {t('checkout.pointsLabel', { points: rewardPoints.points })}
                  </dt>
                  <dd className={cx('tabular', rewardPoints.is_valid ? 'text-accent-600' : 'text-warning-700')}>
                    {rewardPoints.is_valid
                      ? `− ${money(rewardPointsDiscount)}`
                      : (rewardPoints.message ?? t('checkout.noLongerApplies'))}
                  </dd>
                </div>
              )}

              <div className="flex justify-between">
                <dt className="text-ink-600">{t('checkout.delivery')}</dt>
                <dd className="tabular text-ink-900">
                  {rate ? (rate.is_free ? t('checkout.free') : money(totals.delivery)) : '—'}
                </dd>
              </div>

              {totals.extra > 0 && (
                <div className="flex justify-between">
                  <dt className="text-ink-600">{t('checkout.paymentCharge')}</dt>
                  <dd className="tabular text-ink-900">{money(totals.extra)}</dd>
                </div>
              )}

              <div className="flex justify-between border-t border-ink-100 pt-2 text-base font-semibold">
                <dt className="text-ink-900">{t('checkout.total')}</dt>
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
              {t('checkout.placeOrder')}
            </Button>

            {method?.is_cod && (
              <p className="mt-2 flex items-start gap-1.5 text-xs text-ink-500">
                <Truck className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                {t('checkout.payToCourier', { amount: money(totals.total) })}
              </p>
            )}
          </div>
        </div>
      </div>
    </form>
  )
}
