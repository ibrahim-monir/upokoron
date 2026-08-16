import { useEffect, useState } from 'react'
import { Image as ImageIcon } from 'lucide-react'
import { useList, useWrite } from './useResource'
import { MediaPicker } from './media/MediaLibrary'
import { Button, Card, CardHeader, ErrorState, Field, Select, Spinner, Textarea } from '../../components/ui'

/*
 * Only keys the backend declares in config can be written, so this screen is
 * driven by whatever `GET /admin/settings` returns rather than a hardcoded
 * list that would drift from it.
 */
const GROUP_LABELS = {
  store: 'Store details',
  pages: 'Footer pages',
  sales: 'Sales and orders',
  inventory: 'Inventory',
  rewards: 'Reward points',
  affiliate: 'Affiliate',
  tax: 'Tax',
}

/** Long-form settings that need room to write in. */
const MULTILINE = ['page_about', 'page_privacy', 'page_terms', 'store_address', 'store_description']

/** Settings that hold an image URL, so they get a picker instead of a text box. */
const IMAGE_KEYS = ['store_logo', 'store_favicon']

const CHOICES = {
  store_header_style: [
    { value: 'categories', label: 'Categories — top bar, search, category mega menu' },
    { value: 'classic', label: 'Classic — logo, search, Shop/Offers/Contact' },
  ],
  revenue_recognition_point: [
    { value: 'delivered', label: 'On delivery (recommended for COD)' },
    { value: 'shipped', label: 'On shipment' },
  ],
  default_commission_type: [
    { value: 'percentage', label: 'Percentage of order' },
    { value: 'fixed', label: 'Fixed amount' },
  ],
}

function humanise(key) {
  return key.replace(/_/g, ' ').replace(/^./, (char) => char.toUpperCase())
}

export default function SettingsPage() {
  const query = useList('admin.settings', '/admin/settings')
  const write = useWrite('admin.settings', { successMessage: 'Settings saved.' })
  const [values, setValues] = useState({})

  // Which image setting the picker is currently choosing for, if any.
  const [picking, setPicking] = useState(null)

  useEffect(() => {
    if (query.data?.data) setValues(query.data.data)
  }, [query.data])

  if (query.isLoading) {
    return (
      <div className="grid place-items-center py-16">
        <Spinner />
      </div>
    )
  }

  if (query.isError) return <ErrorState error={query.error} onRetry={query.refetch} />

  const groups = query.data?.groups ?? []

  const submit = (event) => {
    event.preventDefault()
    write.mutate({ method: 'put', url: '/admin/settings', body: { settings: values } })
  }

  const set = (key, value) => setValues((current) => ({ ...current, [key]: value }))

  // The API returns a flat map, so group membership comes from the config
  // group list plus a prefix convention.
  const keysFor = (group) =>
    Object.keys(values).filter((key) => {
      if (group === 'store') return key.startsWith('store_')
      if (group === 'pages') return key.startsWith('page_')
      if (group === 'rewards') return key.startsWith('rewards_') || key.includes('points') || key.includes('redeem') || key === 'referral_points' || key === 'expiry_months'
      if (group === 'affiliate') return key.startsWith('affiliate_') || key.startsWith('default_commission') || key === 'cookie_days' || key === 'min_payout_amount'
      if (group === 'tax') return key.startsWith('tax_') || key === 'prices_include_tax'
      if (group === 'inventory') return key === 'allow_negative_stock' || key === 'low_stock_alert'
      return (
        key.startsWith('revenue_') ||
        key.startsWith('reservation_') ||
        key.startsWith('return_window') ||
        key === 'allow_guest_checkout' ||
        key === 'min_order_amount'
      )
    })

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <MediaPicker
        open={picking !== null}
        onClose={() => setPicking(null)}
        onSelect={(item) => set(picking, item.url)}
        folder="branding"
        title="Choose an image"
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink-900">Settings</h1>
          <p className="mt-0.5 text-sm text-ink-500">
            These change how the business behaves, not just how it looks.
          </p>
        </div>

        <Button type="submit" loading={write.isPending}>
          Save changes
        </Button>
      </div>

      {groups.map((group) => {
        const keys = keysFor(group)

        if (keys.length === 0) return null

        return (
          <Card key={group}>
            <CardHeader title={GROUP_LABELS[group] ?? humanise(group)} />

            <div className="grid gap-4 p-4 sm:grid-cols-2">
              {keys.map((key) => {
                const value = values[key]

                if (typeof value === 'boolean') {
                  return (
                    <label key={key} className="flex items-center gap-2 self-end pb-2 text-sm text-ink-700">
                      <input
                        type="checkbox"
                        checked={value}
                        onChange={(event) => set(key, event.target.checked)}
                        className="h-4 w-4 rounded border-ink-300"
                      />
                      {humanise(key)}
                    </label>
                  )
                }

                if (CHOICES[key]) {
                  return (
                    <Field key={key} label={humanise(key)}>
                      {({ id }) => (
                        <Select id={id} value={value ?? ''} onChange={(event) => set(key, event.target.value)}>
                          {CHOICES[key].map((choice) => (
                            <option key={choice.value} value={choice.value}>
                              {choice.label}
                            </option>
                          ))}
                        </Select>
                      )}
                    </Field>
                  )
                }

                // Image settings get a picker and a live preview rather than
                // a text box the owner has to paste a URL into.
                if (IMAGE_KEYS.includes(key)) {
                  return (
                    <Field key={key} label={humanise(key)} hint="Pick from the image library.">
                      {() => (
                        <div className="flex items-center gap-3">
                          <span className="grid h-14 w-28 shrink-0 place-items-center overflow-hidden rounded-lg border border-ink-200 bg-ink-50">
                            {value ? (
                              <img src={value} alt="" className="h-full w-full object-contain" />
                            ) : (
                              <ImageIcon className="h-5 w-5 text-ink-400" aria-hidden="true" />
                            )}
                          </span>

                          <Button variant="secondary" size="sm" onClick={() => setPicking(key)}>
                            {value ? 'Change' : 'Choose'}
                          </Button>

                          {value && (
                            <Button variant="ghost" size="sm" onClick={() => set(key, '')}>
                              Remove
                            </Button>
                          )}
                        </div>
                      )}
                    </Field>
                  )
                }

                if (MULTILINE.includes(key)) {
                  return (
                    <Field
                      key={key}
                      label={humanise(key)}
                      className="sm:col-span-2"
                      hint={
                        key.startsWith('page_')
                          ? 'Shown on the storefront. Left blank, the page says it has not been written yet.'
                          : undefined
                      }
                    >
                      {({ id }) => (
                        <Textarea
                          id={id}
                          rows={key.startsWith('page_') ? 8 : 3}
                          value={value ?? ''}
                          onChange={(event) => set(key, event.target.value)}
                        />
                      )}
                    </Field>
                  )
                }

                return (
                  <Field
                    key={key}
                    label={humanise(key)}
                    type={typeof value === 'number' ? 'number' : 'text'}
                    value={value ?? ''}
                    onChange={(event) =>
                      set(key, typeof value === 'number' ? Number(event.target.value) : event.target.value)
                    }
                  />
                )
              })}
            </div>
          </Card>
        )
      })}
    </form>
  )
}
