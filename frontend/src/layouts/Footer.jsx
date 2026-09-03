import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { get } from '../lib/api'
import {
  Mail,
  MapPin,
  Phone,
} from 'lucide-react'

import { cx } from '../lib/format'
import { useTranslation } from '../lib/i18n'
import { Logo } from '../components/Logo'
import {
  FacebookIcon,
  InstagramIcon,
  TikTokIcon,
  YoutubeIcon,
} from '../components/BrandIcons'

/**
 * What this shop actually accepts, read from the payment methods the owner
 * has switched on.
 *
 * It used to be a list written out here, which meant the footer went on
 * advertising Nagad after someone turned Nagad off. The provider's own
 * artwork is uploaded per method (Admin > Operations > Payments); a method
 * without one falls back to its name, so the row is never broken by a
 * missing file.
 */
function useAcceptedPayments() {
  const query = useQuery({
    queryKey: ['shop', 'accepted-payments'],
    queryFn: () => get('/shop/accepted-payments'),
    staleTime: 5 * 60 * 1000,
    select: (response) => response.data,
  })

  return query.data ?? []
}

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
  const { t } = useTranslation()
  const storeName = settings?.store_name ?? 'Upokoron'
  const payments = useAcceptedPayments()

  const socials = [
    {
      key: 'store_facebook',
      label: 'Facebook',
      icon: FacebookIcon,
      bgClass: 'bg-[#1877F2]',
    },
    {
      key: 'store_youtube',
      label: 'YouTube',
      icon: YoutubeIcon,
      bgClass: 'bg-[#FF0000]',
    },
    {
      key: 'store_instagram',
      label: 'Instagram',
      icon: InstagramIcon,
      // Instagram's mark has never been one flat colour -- the gradient is
      // the brand cue, more than any single hex in it would be.
      bgClass: 'bg-gradient-to-tr from-[#FEDA75] via-[#D62976] to-[#4F5BD5]',
    },
    {
      key: 'store_tiktok',
      label: 'TikTok',
      icon: TikTokIcon,
      bgClass: 'bg-black',
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
                {settings?.store_description ?? t('footer.description')}
              </p>

              {/* Social icons */}
              {socials.length > 0 && (
                <div className="mt-6">
                  <p className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-white/65">
                    {t('footer.followUs')}
                  </p>

                  <div className="flex flex-wrap gap-2.5">
                    {socials.map(({ key, label, icon: Icon, bgClass }) => (
                      <a
                        key={key}
                        href={settings[key]}
                        target="_blank"
                        rel="noreferrer noopener"
                        aria-label={label}
                        className={cx(
                          'grid h-9 w-9 place-items-center rounded-full text-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md',
                          bgClass,
                        )}
                      >
                        <Icon className="h-4 w-4" />
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Quick Links */}
            <FooterColumn title={t('footer.quickLinks')}>
              <ul className="flex flex-col gap-3">
                <FooterLink to="/products">
                  {t('footer.allProducts')}
                </FooterLink>

                <FooterLink to="/products?sort=name">
                  {t('footer.browseProducts')}
                </FooterLink>

                <FooterLink to="/products?sort=oldest">
                  {t('footer.newArrivals')}
                </FooterLink>

                <FooterLink to="/contact">
                  {t('footer.contactUs')}
                </FooterLink>
              </ul>
            </FooterColumn>

            {/* Customer Service */}
            <FooterColumn title={t('footer.customerService')}>
              <ul className="flex flex-col gap-3">
                <FooterLink to="/about">
                  {t('footer.aboutUs')}
                </FooterLink>

                <FooterLink to="/contact">
                  {t('footer.contactUs')}
                </FooterLink>

                <FooterLink to="/privacy">
                  {t('footer.privacyPolicy')}
                </FooterLink>

                <FooterLink to="/terms">
                  {t('footer.termsConditions')}
                </FooterLink>
              </ul>
            </FooterColumn>

            {/* Contact */}
            <FooterColumn title={t('footer.contactInformation')}>
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

                {/*
                   Kept where it was, filled from what the owner has actually
                   switched on. Method names are the provider's own -- bKash
                   is bKash in both languages -- so only the heading is
                   translated. A method with no uploaded artwork shows its
                   name, so a missing file never leaves a gap in the row.
                */}
                {payments.length > 0 && (
                  <div className="pt-1">
                    <p className="mb-2.5 text-xs font-semibold uppercase tracking-[0.12em] text-white/65">
                      {t('footer.weAccept')}
                    </p>

                    <div className="flex flex-wrap gap-2">
                      {payments.map((method) => (
                        <span
                          key={method.id}
                          title={method.name}
                          className={cx(
                            'inline-flex items-center gap-2 rounded-full border border-white/15',
                            'bg-white/5 text-xs font-medium text-white/85',
                            method.logo ? 'py-1 pl-1 pr-3' : 'px-3 py-1.5',
                          )}
                        >
                          {method.logo && (
                            <span className="grid h-6 w-6 shrink-0 place-items-center overflow-hidden rounded-full bg-white">
                              <img
                                src={method.logo}
                                alt=""
                                loading="lazy"
                                className="h-full w-full object-contain"
                              />
                            </span>
                          )}
                          {method.name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </address>
            </FooterColumn>
          </div>
        </div>
      </div>

      {/* =========================================================
          COPYRIGHT BAR
      ========================================================== */}
      <div className="bg-navy-950 text-white">
        <div className="mx-auto flex max-w-[1400px] flex-col items-start gap-3 px-4 py-3 text-xs sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <p className="font-medium">
            © {new Date().getFullYear()} {storeName}. {t('footer.allRightsReserved')}.
          </p>

          <nav className="flex flex-wrap items-center gap-3 font-medium">
            <Link
              to="/privacy"
              className="text-white/75 transition-colors hover:text-white"
            >
              {t('footer.privacyPolicy')}
            </Link>

            <span aria-hidden="true" className="opacity-40">
              |
            </span>

            <Link
              to="/terms"
              className="text-white/75 transition-colors hover:text-white"
            >
              {t('footer.termsConditions')}
            </Link>

            <span aria-hidden="true" className="opacity-40">
              |
            </span>

            <Link
              to="/contact"
              className="text-white/75 transition-colors hover:text-white"
            >
              {t('header.contact')}
            </Link>
          </nav>
        </div>
      </div>
    </footer>
  )
}