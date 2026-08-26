import { useQuery } from '@tanstack/react-query'
import { Clock, FileText, Mail, MapPin, MessageCircle, Phone } from 'lucide-react'
import { get } from '../../lib/api'
import { Card, PageLoader } from '../../components/ui'
import { ContactForm } from './ContactForm'
import { FaqSection } from './FaqSection'

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
    { icon: Clock, label: 'Hours', value: settings?.store_support_hours, href: null },
  ].filter((row) => row.value)

  return (
    <div className="mx-auto max-w-6xl py-4">
      {/*
         A banner in the same language as the home page hero -- gradient,
         dot texture -- so the contact page reads as part of the shop rather
         than a form bolted onto it.
      */}
      <section className="rise relative overflow-hidden rounded-card bg-gradient-to-br from-brand-600 to-brand-900 px-6 py-10 text-white sm:px-10 sm:py-14">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-[0.13]"
          style={{
            backgroundImage: 'radial-gradient(currentColor 1.5px, transparent 1.5px)',
            backgroundSize: '22px 22px',
          }}
        />

        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-white/10 blur-3xl"
        />

        <div className="relative max-w-xl">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold uppercase tracking-wider">
            <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" />
            We are listening
          </span>

          <h1 className="mt-4 text-3xl font-bold leading-tight sm:text-4xl">Contact us</h1>

          <p className="mt-3 text-white/85">
            A question about an order, a product, or a return — call us, write to us, or leave a
            message below and we will come back to you.
          </p>
        </div>
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <div className="flex h-full flex-col gap-3">
          {rows.length === 0 ? (
            <Card className="rise flex-1 p-5">
              <p className="font-medium text-ink-800">No contact details have been added yet.</p>
              <p className="mt-1 text-sm text-ink-600">
                The store owner can add them under{' '}
                <span className="font-medium">Admin → Settings → Store</span>.
              </p>
            </Card>
          ) : (
            rows.map(({ icon: Icon, label, value, href }, index) => {
              const body = (
                <>
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-800 transition-colors group-hover:bg-brand-600 group-hover:text-white">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </span>

                  <span className="min-w-0">
                    <span className="block text-xs font-medium uppercase tracking-wide text-ink-500">
                      {label}
                    </span>
                    <span className="mt-0.5 block whitespace-pre-line text-ink-900">{value}</span>
                  </span>
                </>
              )

              /*
                 Each card waits a little longer than the one above it, so
                 the column arrives as a sequence rather than a block. Small
                 steps -- 60ms is felt, 300ms is waited for.
              */
              const style = { animationDelay: `${80 + index * 60}ms` }

              return href ? (
                <a
                  key={label}
                  href={href}
                  style={style}
                  className="rise group flex flex-1 items-center gap-3 rounded-card border border-ink-200 bg-white p-4 transition-all hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-card"
                >
                  {body}
                </a>
              ) : (
                <div
                  key={label}
                  style={style}
                  className="rise group flex flex-1 items-center gap-3 rounded-card border border-ink-200 bg-white p-4 transition-all hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-card"
                >
                  {body}
                </div>
              )
            })
          )}
        </div>

        <ContactForm />
      </div>

      <FaqSection
        title={settings?.faq_title || 'Frequently asked questions'}
        intro={settings?.faq_intro}
      />
    </div>
  )
}
