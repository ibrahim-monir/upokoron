import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  BadgeCheck,
  Boxes,
  Gift,
  Package,
  ShieldAlert,
  Store,
  Wallet,
} from 'lucide-react'

import { get } from '../../lib/api'
import { cx } from '../../lib/format'
import { Card, PageLoader } from '../../components/ui'

function useStoreSettings() {
  return useQuery({
    queryKey: ['shop', 'settings'],
    queryFn: () => get('/shop/settings'),
    staleTime: 5 * 60 * 1000,
    select: (response) => response.data,
  })
}

const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'bn', label: 'বাংলা' },
]

/*
 * Both languages sit in one component rather than behind a site-wide
 * translation layer, because one page is bilingual and the rest of the shop
 * is not. Pretending otherwise would mean a framework carrying two strings.
 */
const COPY = {
  en: {
    chip: 'Established 2026',
    heading: 'About us',
    noticeTitle: 'A note on ownership',
    story: 'Our story',
    how: 'How we work',
    cta: 'Start shopping',
    ctaAside: 'Something to ask first?',
    ctaLink: 'Talk to us',
    missing: 'This has not been written yet. The owner adds it under Admin → Settings → Pages.',
  },
  bn: {
    chip: 'প্রতিষ্ঠা ২০২৬',
    heading: 'আমাদের সম্পর্কে',
    noticeTitle: 'মালিকানা সম্পর্কে জরুরি বিজ্ঞপ্তি',
    story: 'আমাদের কথা',
    how: 'আমরা যেভাবে কাজ করি',
    cta: 'কেনাকাটা শুরু করুন',
    ctaAside: 'আগে কিছু জানার আছে?',
    ctaLink: 'আমাদের সাথে কথা বলুন',
    missing: 'এটি এখনো লেখা হয়নি। Admin → Settings → Pages থেকে যোগ করা যাবে।',
  },
}

/*
 * Short enough to keep in both languages here. These describe things the
 * shop actually does -- a real stock count, a real payment method, a real
 * points balance -- so none of them is a claim the software cannot back.
 */
const PRACTICES = [
  {
    icon: Boxes,
    en: { title: 'Real stock counts', body: 'What the page says is in stock is what the shelf holds. We do not take orders for what we do not have.' },
    bn: { title: 'সত্যিকারের স্টক', body: 'পেজে যা স্টকে দেখাচ্ছে, তাকেই বোঝায় আমাদের কাছে আছে। যা নেই, তার অর্ডার আমরা নিই না।' },
  },
  {
    icon: Wallet,
    en: { title: 'Pay when it arrives', body: 'Cash on delivery, or bKash and Nagad if you would rather pay up front. The price you saw is the price you pay.' },
    bn: { title: 'পণ্য হাতে পেয়ে দাম', body: 'ক্যাশ অন ডেলিভারি, অথবা চাইলে আগেই বিকাশ ও নগদে। যে দাম দেখেছেন, সেটাই দেবেন।' },
  },
  {
    icon: Gift,
    en: { title: 'Points on every order', body: 'Delivered orders earn reward points that come straight off a later bill.' },
    bn: { title: 'প্রতি অর্ডারে পয়েন্ট', body: 'ডেলিভারি হওয়া অর্ডারে রিওয়ার্ড পয়েন্ট জমা হয়, যা পরের বিল থেকে সরাসরি কমে যায়।' },
    to: '/rewards',
  },
  {
    icon: Package,
    en: { title: 'Track it yourself', body: 'Every order has a number you can follow from confirmation to your door, without calling anyone.' },
    bn: { title: 'নিজেই ট্র্যাক করুন', body: 'প্রতিটি অর্ডারের একটি নম্বর থাকে — কনফার্ম থেকে দরজা পর্যন্ত কাউকে ফোন না করেই দেখে নিতে পারবেন।' },
    to: '/track',
  },
]

/**
 * Textareas submit CRLF, and the seeded defaults are LF, so neither can be
 * assumed. Blank runs of any length split a paragraph.
 */
function paragraphs(text) {
  return (text ?? '')
    .split(/\r?\n\s*\r?\n/)
    .map((block) => block.trim())
    .filter(Boolean)
}

/**
 * The ownership notice.
 *
 * Shown in both languages at once, always, while everything else on the page
 * follows the toggle. It is the one statement here that has to reach whoever
 * is reading, and a language tab is a way of not reading something. The
 * chosen language leads; the other follows it rather than hiding behind it.
 */
function OwnershipNotice({ lang, english, bangla }) {
  const ordered = lang === 'bn' ? [bangla, english] : [english, bangla]
  const bodies = ordered.filter(Boolean)

  if (bodies.length === 0) return null

  return (
    // Not a Card: Card paints all four borders ink-200, and whether that or
    // the amber left edge wins would come down to stylesheet order rather
    // than anything written here.
    <div
      className="rise mt-6 overflow-hidden rounded-card border-y border-r border-warning-500/30 border-l-4 border-l-warning-500 bg-warning-50 p-5 shadow-card sm:p-6"
      style={{ animationDelay: '80ms' }}
    >
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-warning-500/15 text-warning-700">
          <ShieldAlert className="h-5 w-5" aria-hidden="true" />
        </span>

        <div className="min-w-0">
          <p className="text-sm font-bold uppercase tracking-wide text-warning-700">
            {COPY[lang].noticeTitle}
          </p>

          <div className="mt-2 flex flex-col gap-3">
            {bodies.map((body, index) => (
              <p
                key={index}
                className={cx(
                  'leading-relaxed',
                  index === 0
                    ? 'font-medium text-ink-900'
                    : 'border-t border-warning-500/25 pt-3 text-ink-700',
                )}
              >
                {body}
              </p>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function PracticeCard({ practice, lang, delay }) {
  const Icon = practice.icon
  const { title, body } = practice[lang]

  const inner = (
    <>
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-800 transition-colors group-hover:bg-brand-600 group-hover:text-white">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>

      <span className="min-w-0">
        <span className="block font-semibold text-ink-900">{title}</span>
        <span className="mt-1 block text-sm leading-6 text-ink-600">{body}</span>
      </span>
    </>
  )

  const shared = cx(
    'rise group flex h-full items-start gap-3 p-4 transition-all',
    'hover:-translate-y-0.5 hover:border-brand-300',
  )

  const style = { animationDelay: `${delay}ms` }

  // Card is a plain div, so a linked card has to be the anchor itself rather
  // than a Card wrapped in one -- nesting them would make the whole tile a
  // link containing a block that is also a link target.
  return practice.to ? (
    <Link
      to={practice.to}
      style={style}
      className={cx(shared, 'rounded-card border border-ink-200 bg-white shadow-card')}
    >
      {inner}
    </Link>
  ) : (
    <Card className={shared} style={style}>
      {inner}
    </Card>
  )
}

/**
 * About us, in English and Bangla.
 *
 * The prose is two settings per language rather than markup, so the owner
 * can correct anything here without a deploy -- including the notice, which
 * is the part most likely to need a lawyer's wording one day.
 */
export function AboutPage() {
  const [lang, setLang] = useState('en')
  const { data: settings, isLoading } = useStoreSettings()

  if (isLoading) return <PageLoader />

  const copy = COPY[lang]
  const story = paragraphs(lang === 'bn' ? settings?.about_intro_bangla : settings?.about_intro)

  return (
    <div className="mx-auto max-w-5xl py-4">
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

        <div className="relative flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-xl">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold uppercase tracking-wider">
              <Store className="h-3.5 w-3.5" aria-hidden="true" />
              {copy.chip}
            </span>

            <h1 className="mt-4 text-3xl font-bold leading-tight sm:text-4xl">{copy.heading}</h1>

            <p className="mt-3 text-white/85">
              {settings?.store_name || 'Upokoron.com'}
              {settings?.store_tagline ? ` — ${settings.store_tagline}` : ''}
            </p>
          </div>

          {/*
             The switch sits in the banner rather than above the body, because
             a reader who cannot read the heading needs it before they reach
             anything else.
          */}
          <div
            role="group"
            aria-label="Language"
            className="flex shrink-0 rounded-full bg-white/15 p-1"
          >
            {LANGUAGES.map((option) => (
              <button
                key={option.code}
                type="button"
                onClick={() => setLang(option.code)}
                aria-pressed={lang === option.code}
                className={cx(
                  'rounded-full px-4 py-1.5 text-sm font-semibold transition-colors',
                  lang === option.code
                    ? 'bg-white text-brand-800'
                    : 'text-white/80 hover:text-white',
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      <OwnershipNotice
        lang={lang}
        english={settings?.about_notice}
        bangla={settings?.about_notice_bangla}
      />

      <h2 className="mt-8 text-lg font-bold uppercase tracking-wide text-ink-900">{copy.story}</h2>

      {story.length > 0 ? (
        <div className="mt-3 flex flex-col gap-4">
          {story.map((block, index) => (
            <p
              key={index}
              style={{ animationDelay: `${60 + index * 50}ms` }}
              className="rise leading-relaxed text-ink-700"
            >
              {block}
            </p>
          ))}
        </div>
      ) : (
        <Card className="mt-3 p-5 text-sm text-ink-600">{copy.missing}</Card>
      )}

      <h2 className="mt-8 text-lg font-bold uppercase tracking-wide text-ink-900">{copy.how}</h2>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {PRACTICES.map((practice, index) => (
          <PracticeCard
            key={practice.en.title}
            practice={practice}
            lang={lang}
            delay={80 + index * 60}
          />
        ))}
      </div>

      <div className="rise mt-8 flex flex-wrap items-center justify-between gap-4 rounded-card bg-navy-900 px-6 py-6 text-white">
        <p className="flex items-center gap-2 font-semibold">
          <BadgeCheck className="h-5 w-5 shrink-0" aria-hidden="true" />
          {copy.ctaAside}{' '}
          <Link to="/contact" className="underline underline-offset-4 hover:text-white/80">
            {copy.ctaLink}
          </Link>
        </p>

        <Link
          to="/products"
          className="rounded-lg bg-white px-5 py-2.5 text-sm font-semibold text-navy-900 transition-colors hover:bg-brand-50"
        >
          {copy.cta}
        </Link>
      </div>
    </div>
  )
}
