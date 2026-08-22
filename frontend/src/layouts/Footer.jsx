import { Link } from 'react-router-dom'
import {
  Mail,
  MapPin,
  Phone,
  Globe,
} from 'lucide-react'

import { Logo } from '../components/Logo'
import {
  FacebookIcon,
  InstagramIcon,
  TikTokIcon,
  YoutubeIcon,
} from '../components/BrandIcons'

function FooterLink({ to, children }) {
  return (
    <li>
      <Link
        to={to}
        className="group inline-flex items-center gap-1.5 text-sm text-white/80 transition-all duration-200 hover:translate-x-0.5 hover:text-white"
      >
        <span className="h-1 w-1 rounded-full bg-white/50 transition-colors group-hover:bg-white" />
        {children}
      </Link>
    </li>
  )
}

function FooterColumn({ title, children }) {
  return (
    <div>
      <h3 className="text-sm font-bold uppercase tracking-[0.08em] text-white">
        {title}
      </h3>

      <div className="mt-5">
        {children}
      </div>
    </div>
  )
}

export function Footer({ settings }) {
  const storeName = settings?.store_name ?? 'Upokoron'

  const socials = [
    {
      key: 'store_facebook',
      label: 'Facebook',
      icon: FacebookIcon,
    },
    {
      key: 'store_youtube',
      label: 'YouTube',
      icon: YoutubeIcon,
    },
    {
      key: 'store_instagram',
      label: 'Instagram',
      icon: InstagramIcon,
    },
    {
      key: 'store_tiktok',
      label: 'TikTok',
      icon: TikTokIcon,
    },
  ].filter((social) => settings?.[social.key])

  return (
    <footer className="mt-16">
      {/* =========================================================
          MAIN FOOTER
      ========================================================== */}
      <div className="relative overflow-hidden bg-navy-900 text-white">
        {/* Decorative background */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-32 -top-32 h-72 w-72 rounded-full bg-white/10 blur-3xl"
        />

        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-40 left-1/3 h-80 w-80 rounded-full bg-black/10 blur-3xl"
        />

        <div className="relative mx-auto max-w-[1400px] px-4 sm:px-6 lg:px-8">
          {/* -----------------------------------------------------
              Main columns
          ------------------------------------------------------ */}
          <div className="grid gap-10 py-12 sm:grid-cols-2 lg:grid-cols-[1.45fr_1fr_1fr_1.25fr] lg:gap-12">
            {/* Brand */}
            <div>
              {/* Logo links to the home page itself; wrapping it in another
                  Link would nest an <a> inside an <a>. */}
              <Logo
                settings={settings}
                variant="light"
                className="w-fit [&_img]:h-10 sm:[&_img]:h-11"
              />

              <p className="mt-5 max-w-sm text-sm leading-7 text-white/80">
                {settings?.store_description ??
                  'Discover quality products at great prices with a simple, secure and convenient online shopping experience.'}
              </p>

              {/* Social icons */}
              {socials.length > 0 && (
                <div className="mt-6">
                  <p className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-white/65">
                    Follow us
                  </p>

                  <div className="flex flex-wrap gap-2.5">
                    {socials.map(({ key, label, icon: Icon }) => (
                      <a
                        key={key}
                        href={settings[key]}
                        target="_blank"
                        rel="noreferrer noopener"
                        aria-label={label}
                        className="grid h-9 w-9 place-items-center rounded-full border border-white/25 bg-white/10 text-white/75 transition-all duration-200 hover:-translate-y-0.5 hover:border-white hover:bg-white hover:text-brand-800"
                      >
                        <Icon className="h-4 w-4" />
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Quick Links */}
            <FooterColumn title="Quick Links">
              <ul className="flex flex-col gap-3">
                <FooterLink to="/products">
                  All Products
                </FooterLink>

                <FooterLink to="/products?sort=name">
                  Browse Products
                </FooterLink>

                <FooterLink to="/products?sort=oldest">
                  New Arrivals
                </FooterLink>

                <FooterLink to="/contact">
                  Contact Us
                </FooterLink>
              </ul>
            </FooterColumn>

            {/* Customer Service */}
            <FooterColumn title="Customer Service">
              <ul className="flex flex-col gap-3">
                <FooterLink to="/about">
                  About Us
                </FooterLink>

                <FooterLink to="/contact">
                  Contact Us
                </FooterLink>

                <FooterLink to="/privacy">
                  Privacy Policy
                </FooterLink>

                <FooterLink to="/terms">
                  Terms & Conditions
                </FooterLink>
              </ul>
            </FooterColumn>

            {/* Contact */}
            <FooterColumn title="Contact Information">
              <address className="flex flex-col gap-4 text-sm not-italic">
                {settings?.store_address && (
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white/15 text-white">
                      <MapPin className="h-4 w-4" aria-hidden="true" />
                    </span>

                    <p className="whitespace-pre-line leading-6 text-white/80">
                      {settings.store_address}
                    </p>
                  </div>
                )}

                {settings?.store_phone && (
                  <a
                    href={`tel:${settings.store_phone}`}
                    className="group flex items-center gap-3 text-white/80 transition-colors hover:text-white"
                  >
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white/15 text-white">
                      <Phone className="h-4 w-4" aria-hidden="true" />
                    </span>

                    <span className="tabular">
                      {settings.store_phone}
                    </span>
                  </a>
                )}

                {settings?.store_phone_alt && (
                  <a
                    href={`tel:${settings.store_phone_alt}`}
                    className="group flex items-center gap-3 text-white/80 transition-colors hover:text-white"
                  >
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white/15 text-white">
                      <Phone className="h-4 w-4" aria-hidden="true" />
                    </span>

                    <span className="tabular">
                      {settings.store_phone_alt}
                    </span>
                  </a>
                )}

                {settings?.store_email && (
                  <a
                    href={`mailto:${settings.store_email}`}
                    className="group flex items-center gap-3 break-all text-white/80 transition-colors hover:text-white"
                  >
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white/15 text-white">
                      <Mail className="h-4 w-4" aria-hidden="true" />
                    </span>

                    <span>{settings.store_email}</span>
                  </a>
                )}

                <div className="flex items-center gap-3 text-white/80">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white/15 text-white">
                    <Globe className="h-4 w-4" aria-hidden="true" />
                  </span>

                  <span>{window.location.host}</span>
                </div>
              </address>
            </FooterColumn>
          </div>
        </div>
      </div>

      {/* =========================================================
          COPYRIGHT BAR
      ========================================================== */}
      <div className="bg-navy-950 text-white">
        <div className="mx-auto flex max-w-[1400px] flex-col gap-3 px-4 py-3 text-xs sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <p className="font-medium">
            © {new Date().getFullYear()} {storeName}. All Rights Reserved.
          </p>

          <nav className="flex flex-wrap items-center gap-3 font-medium">
            <Link
              to="/privacy"
              className="text-white/75 transition-colors hover:text-white"
            >
              Privacy Policy
            </Link>

            <span aria-hidden="true" className="opacity-40">
              |
            </span>

            <Link
              to="/terms"
              className="text-white/75 transition-colors hover:text-white"
            >
              Terms & Conditions
            </Link>

            <span aria-hidden="true" className="opacity-40">
              |
            </span>

            <Link
              to="/contact"
              className="text-white/75 transition-colors hover:text-white"
            >
              Contact
            </Link>
          </nav>
        </div>
      </div>
    </footer>
  )
}