import { Link } from 'react-router-dom'
import { ChevronRight, Globe, Mail, Phone } from 'lucide-react'
import { Logo } from '../components/Logo'
import { FacebookIcon, InstagramIcon, TikTokIcon, YoutubeIcon } from '../components/BrandIcons'

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
