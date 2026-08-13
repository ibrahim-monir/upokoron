import { Link } from 'react-router-dom'
import { ChevronRight, Globe, Mail, Phone } from 'lucide-react'
import { Logo } from '../components/Logo'

/*
 * Brand marks are drawn inline rather than imported.
 *
 * Lucide removed Facebook, Instagram, YouTube and the rest in v1 -- they are
 * trademarks, not icons it can license. Importing them builds fine in an
 * editor and then fails the production build with three unresolved exports.
 */
function FacebookIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M22 12.06C22 6.5 17.52 2 12 2S2 6.5 2 12.06c0 5.02 3.66 9.18 8.44 9.94v-7.03H7.9v-2.91h2.54V9.85c0-2.52 1.5-3.91 3.77-3.91 1.09 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.78-1.63 1.57v1.89h2.78l-.45 2.91h-2.33V22c4.78-.76 8.44-4.92 8.44-9.94Z" />
    </svg>
  )
}

function YoutubeIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M21.58 7.19a2.51 2.51 0 0 0-1.77-1.77C18.25 5 12 5 12 5s-6.25 0-7.81.42a2.51 2.51 0 0 0-1.77 1.77A26.2 26.2 0 0 0 2 12a26.2 26.2 0 0 0 .42 4.81 2.51 2.51 0 0 0 1.77 1.77C5.75 19 12 19 12 19s6.25 0 7.81-.42a2.51 2.51 0 0 0 1.77-1.77A26.2 26.2 0 0 0 22 12a26.2 26.2 0 0 0-.42-4.81ZM10 15.02V8.98L15.2 12 10 15.02Z" />
    </svg>
  )
}

function InstagramIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M12 2.16c3.2 0 3.58.01 4.85.07 1.17.05 1.8.25 2.23.41.56.22.96.48 1.38.9.42.42.68.82.9 1.38.16.42.36 1.06.41 2.23.06 1.27.07 1.65.07 4.85s-.01 3.58-.07 4.85c-.05 1.17-.25 1.8-.41 2.23-.22.56-.48.96-.9 1.38-.42.42-.82.68-1.38.9-.42.16-1.06.36-2.23.41-1.27.06-1.65.07-4.85.07s-3.58-.01-4.85-.07c-1.17-.05-1.8-.25-2.23-.41-.56-.22-.96-.48-1.38-.9-.42-.42-.68-.82-.9-1.38-.16-.42-.36-1.06-.41-2.23C2.17 15.58 2.16 15.2 2.16 12s.01-3.58.07-4.85c.05-1.17.25-1.8.41-2.23.22-.56.48-.96.9-1.38.42-.42.82-.68 1.38-.9.42-.16 1.06-.36 2.23-.41C8.42 2.17 8.8 2.16 12 2.16Zm0 3.72a6.12 6.12 0 1 0 0 12.24 6.12 6.12 0 0 0 0-12.24Zm0 10.1a3.98 3.98 0 1 1 0-7.96 3.98 3.98 0 0 1 0 7.96Zm7.79-10.34a1.43 1.43 0 1 1-2.86 0 1.43 1.43 0 0 1 2.86 0Z" />
    </svg>
  )
}

function TikTokIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M16.6 5.82A4.28 4.28 0 0 1 15.54 3h-3.09v12.4a2.59 2.59 0 0 1-2.59 2.5 2.59 2.59 0 0 1 0-5.18c.27 0 .52.04.76.12v-3.2a5.8 5.8 0 0 0-.76-.05 5.72 5.72 0 1 0 5.72 5.72V9.01a7.35 7.35 0 0 0 4.29 1.37V7.3a4.29 4.29 0 0 1-3.27-1.48Z" />
    </svg>
  )
}

function LinkColumn({ title, links }) {
  return (
    <div>
      <h3 className="text-base font-semibold text-white">{title}</h3>

      <ul className="mt-4 flex flex-col gap-2.5">
        {/* Keyed on the label, not the href: two links can legitimately point
            at the same page with different filters. */}
        {links.map((link) => (
          <li key={link.label}>
            <Link
              to={link.to}
              className="group inline-flex items-center gap-1.5 text-sm text-slate-300 transition-colors hover:text-white"
            >
              <ChevronRight
                className="h-3.5 w-3.5 shrink-0 text-slate-500 transition-colors group-hover:text-brand-400"
                aria-hidden="true"
              />
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function Footer({ settings }) {
  const storeName = settings?.store_name ?? 'Upokoron'

  const socials = [
    { key: 'store_facebook', label: 'Facebook', icon: FacebookIcon },
    { key: 'store_youtube', label: 'YouTube', icon: YoutubeIcon },
    { key: 'store_instagram', label: 'Instagram', icon: InstagramIcon },
    { key: 'store_tiktok', label: 'TikTok', icon: TikTokIcon },
    // A blank setting means the shop is not on that platform, so the icon is
    // dropped rather than linking to nowhere.
  ].filter((social) => settings?.[social.key])

  return (
    <footer className="mt-10 bg-navy-900 text-slate-300">
      <div className="mx-auto max-w-[1400px] px-4 py-12">
        <div className="grid gap-10 lg:grid-cols-[1.4fr_1fr_1fr_1.2fr]">
          <div>
            {/* variant="light" knocks the near-black wordmark out to white so
                it reads on the navy. */}
            <Logo settings={settings} variant="light" className="[&_img]:h-12" />

            <p className="mt-5 max-w-sm text-sm leading-relaxed text-slate-400">
              {settings?.store_description ??
                'Household goods sourced directly and stocked in Dhaka.'}
            </p>

            {socials.length > 0 && (
              <div className="mt-5 flex gap-3">
                {socials.map(({ key, label, icon: Icon }) => (
                  <a
                    key={key}
                    href={settings[key]}
                    target="_blank"
                    rel="noreferrer noopener"
                    aria-label={label}
                    className="grid h-10 w-10 place-items-center rounded-full border border-slate-600 text-slate-300 transition-colors hover:border-brand-400 hover:bg-brand-600 hover:text-white"
                  >
                    <Icon className="h-4 w-4" />
                  </a>
                ))}
              </div>
            )}
          </div>

          {/* Each link goes somewhere different. "Shop" and "All Products"
              were the same page under two names, which is a dead link with
              extra steps. */}
          <LinkColumn
            title="Quick Links"
            links={[
              { to: '/products', label: 'All Products' },
              { to: '/products?sort=name', label: 'Browse A–Z' },
              { to: '/products?sort=oldest', label: 'Oldest first' },
            ]}
          />

          <LinkColumn
            title="About Business"
            links={[
              { to: '/about', label: 'About us' },
              { to: '/contact', label: 'Contact us' },
              { to: '/privacy', label: 'Privacy Policy' },
              { to: '/terms', label: 'Terms & Conditions' },
            ]}
          />

          <div>
            <h3 className="text-base font-semibold text-white">Contact Us</h3>

            <address className="mt-4 flex flex-col gap-3 text-sm not-italic text-slate-300">
              {settings?.store_address && (
                <p className="whitespace-pre-line leading-relaxed">{settings.store_address}</p>
              )}

              {settings?.store_phone && (
                <a
                  href={`tel:${settings.store_phone}`}
                  className="flex items-center gap-2.5 transition-colors hover:text-white"
                >
                  <Phone className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                  <span className="tabular">{settings.store_phone}</span>
                </a>
              )}

              {settings?.store_phone_alt && (
                <a
                  href={`tel:${settings.store_phone_alt}`}
                  className="flex items-center gap-2.5 transition-colors hover:text-white"
                >
                  <Phone className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                  <span className="tabular">{settings.store_phone_alt}</span>
                </a>
              )}

              {settings?.store_email && (
                <a
                  href={`mailto:${settings.store_email}`}
                  className="flex items-center gap-2.5 transition-colors hover:text-white"
                >
                  <Mail className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                  {settings.store_email}
                </a>
              )}

              <a
                href="/"
                className="flex items-center gap-2.5 transition-colors hover:text-white"
              >
                <Globe className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                {window.location.host}
              </a>
            </address>
          </div>
        </div>

        <div className="mt-10 flex flex-col gap-4 border-t border-slate-700/60 pt-6 text-sm sm:flex-row sm:items-center sm:justify-between">
          <p className="uppercase tracking-wide text-slate-400">
            © {new Date().getFullYear()} {storeName}, all rights reserved.
          </p>

          {/* Right padding keeps these clear of the floating WhatsApp and
              cart buttons, which are fixed over this corner. */}
          <nav className="flex flex-wrap items-center gap-x-3 gap-y-2 text-slate-400 sm:pr-20">
            <Link to="/contact" className="transition-colors hover:text-white">
              Contact
            </Link>
            <span aria-hidden="true" className="text-slate-600">|</span>
            <Link to="/privacy" className="transition-colors hover:text-white">
              Privacy
            </Link>
            <span aria-hidden="true" className="text-slate-600">|</span>
            <Link to="/terms" className="transition-colors hover:text-white">
              Terms
            </Link>
          </nav>
        </div>
      </div>
    </footer>
  )
}
