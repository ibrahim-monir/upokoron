import { useQuery } from '@tanstack/react-query'
import { FileText, Mail, MapPin, Phone } from 'lucide-react'
import { get } from '../../lib/api'
import { Card, PageLoader } from '../../components/ui'

function useStoreSettings() {
  return useQuery({
    queryKey: ['shop', 'settings'],
    queryFn: () => get('/shop/settings'),
    staleTime: 5 * 60 * 1000,
    select: (response) => response.data,
  })
}

/**
 * About, Privacy, and Terms.
 *
 * The body comes from a setting the owner writes. When it is empty the page
 * says so instead of showing filler -- a made-up privacy policy is a legal
 * document that does not describe this shop, which is worse than an honest
 * blank.
 */
export function ContentPage({ title, settingKey, intro }) {
  const { data: settings, isLoading } = useStoreSettings()

  if (isLoading) return <PageLoader />

  const body = settings?.[settingKey]

  return (
    <div className="mx-auto max-w-3xl py-4">
      <h1 className="text-2xl font-semibold text-ink-900">{title}</h1>
      {intro && <p className="mt-2 text-ink-600">{intro}</p>}

      {body ? (
        <div className="mt-6 whitespace-pre-line leading-relaxed text-ink-700">{body}</div>
      ) : (
        <Card className="mt-6 flex items-start gap-3 p-5">
          <FileText className="mt-0.5 h-5 w-5 shrink-0 text-ink-400" aria-hidden="true" />
          <div>
            <p className="font-medium text-ink-800">This page has not been written yet.</p>
            <p className="mt-1 text-sm text-ink-600">
              The store owner can add it under{' '}
              <span className="font-medium">Admin → Settings → Pages</span>. It is left blank on
              purpose rather than filled with sample text.
            </p>
          </div>
        </Card>
      )}
    </div>
  )
}

/**
 * Contact is different: every detail on it is a real setting, so it works
 * from the moment the owner fills in their address and phone number.
 */
export function ContactPage() {
  const { data: settings, isLoading } = useStoreSettings()

  if (isLoading) return <PageLoader />

  const rows = [
    { icon: MapPin, label: 'Address', value: settings?.store_address, href: null },
    { icon: Phone, label: 'Phone', value: settings?.store_phone, href: `tel:${settings?.store_phone}` },
    {
      icon: Phone,
      label: 'Alternate phone',
      value: settings?.store_phone_alt,
      href: `tel:${settings?.store_phone_alt}`,
    },
    { icon: Mail, label: 'Email', value: settings?.store_email, href: `mailto:${settings?.store_email}` },
  ].filter((row) => row.value)

  return (
    <div className="mx-auto max-w-3xl py-4">
      <h1 className="text-2xl font-semibold text-ink-900">Contact us</h1>
      <p className="mt-2 text-ink-600">
        Questions about an order, a product, or a return — reach us any of these ways.
      </p>

      {rows.length === 0 ? (
        <Card className="mt-6 p-5">
          <p className="font-medium text-ink-800">No contact details have been added yet.</p>
          <p className="mt-1 text-sm text-ink-600">
            The store owner can add them under <span className="font-medium">Admin → Settings → Store</span>.
          </p>
        </Card>
      ) : (
        <Card className="mt-6 divide-y divide-ink-100">
          {rows.map(({ icon: Icon, label, value, href }) => (
            <div key={label} className="flex items-start gap-3 p-4">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-800">
                <Icon className="h-4 w-4" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-wide text-ink-500">{label}</p>
                {href ? (
                  <a href={href} className="text-ink-900 hover:text-brand-800">
                    {value}
                  </a>
                ) : (
                  <p className="whitespace-pre-line text-ink-900">{value}</p>
                )}
              </div>
            </div>
          ))}
        </Card>
      )}
    </div>
  )
}
