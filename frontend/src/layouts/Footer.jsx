import { Link } from 'react-router-dom'
import {
  Banknote,
  Landmark,
  Mail,
  MapPin,
  Phone,
  Smartphone,
  Wallet,
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

/*
 * What checkout actually offers (see PaymentMethodSeeder). Each badge's own
 * brand colour carries the identity here -- a generic icon rather than the
 * literal wordmark, since no bKash/Nagad logo artwork is licensed for use
 * in this codebase, but the colour alone reads as "that one" at a glance.
 * bKash and Nagad are brand names, kept as-is in both languages; the other
 * two are translated via labelKey.
 */
const PAYMENT_METHODS = [
  { labelKey: 'footer.cashOnDelivery', icon: Banknote, bgClass: 'bg-success-600' },
  { label: 'bKash', icon: Smartphone, bgClass: 'bg-[#E2136E]' },
  { label: 'Nagad', icon: Wallet, bgClass: 'bg-[#F5821F]' },
  { labelKey: 'footer.bankTransfer', icon: Landmark, bgClass: 'bg-brand-600' },
]

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

                <div className="pt-1">
                  <p className="mb-2.5 text-xs font-semibold uppercase tracking-[0.12em] text-white/65">
                    {t('footer.weAccept')}
                  </p>

                  <div className="flex flex-wrap gap-2">
                    {PAYMENT_METHODS.map(({ label, labelKey, icon: Icon, bgClass }) => (
                      <span
                        key={labelKey ?? label}
                        className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 py-1 pl-1 pr-3 text-xs font-medium text-white/85"
                      >
                        <span className={cx('grid h-6 w-6 shrink-0 place-items-center rounded-full text-white', bgClass)}>
                          <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                        </span>
                        {labelKey ? t(labelKey) : label}
                      </span>
                    ))}
                  </div>
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