import { Link, Navigate } from 'react-router-dom'
import { Cake, Gift, ShoppingBag, Star, Timer, UserCheck, Wallet } from 'lucide-react'

import { money } from '../../lib/format'
import { useTranslation } from '../../lib/i18n'
import { useRewardInfo } from './useRewardInfo'
import { Card, PageLoader } from '../../components/ui'
import { useAuthStore } from '../../stores/authStore'

function EarnCard({ icon: Icon, points, title, body, delay }) {
  if (!points) return null

  return (
    <Card
      style={{ animationDelay: `${delay}ms` }}
      className="rise flex flex-1 items-start gap-3 p-4 transition-all hover:-translate-y-0.5 hover:border-brand-300"
    >
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-800">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>

      <div className="min-w-0">
        <p className="font-semibold text-ink-900">{title}</p>
        <p className="mt-0.5 text-sm text-ink-600">{body}</p>
      </div>
    </Card>
  )
}

/*
 * A translated sentence with one figure set in bold. The sentence stays whole
 * in the string table, with `{n}` where the figure goes, because Bangla puts
 * the number somewhere else in the sentence than English does.
 */
function Emphasised({ text, value }) {
  const [before, after = ''] = text.split('{n}')

  return (
    <>
      {before}
      <strong className="font-semibold text-ink-900">{value}</strong>
      {after}
    </>
  )
}

/**
 * What the points are worth.
 *
 * The product page has always promised "earn N points" without anywhere
 * saying what a point buys -- a promise with no terms. Every figure here
 * comes from the settings the programme actually runs on, so the page
 * cannot drift from what checkout will do.
 */
export function RewardsPage() {
  const user = useAuthStore((state) => state.user)
  const { t } = useTranslation()

  const query = useRewardInfo()

  if (query.isLoading) return <PageLoader />

  const info = query.data

  // A shop can run the programme quietly. When it does, this page is not
  // "empty" -- it does not exist.
  if (!info?.advertised) return <Navigate to="/" replace />

  const perOrder = t(info.earn_points === 1 ? 'rewardsPage.perOrderOne' : 'rewardsPage.perOrder', {
    points: info.earn_points,
    amount: money(info.earn_per_amount),
  })

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

        <div className="relative max-w-xl">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold uppercase tracking-wider">
            <Gift className="h-3.5 w-3.5" aria-hidden="true" />
            {t('reward.title')}
          </span>

          <h1 className="mt-4 text-3xl font-bold leading-tight sm:text-4xl">
            {t('rewardsPage.headline')}
          </h1>

          <p className="mt-3 text-white/85">{t('rewardsPage.intro', { perOrder })}</p>

          <Link
            to={user ? '/account?section=rewards' : '/register'}
            className="mt-6 inline-flex items-center gap-2 rounded-lg bg-white px-5 py-2.5 text-sm font-semibold text-brand-800 transition-colors hover:bg-brand-50"
          >
            {user ? t('rewardsPage.seeMyPoints') : t('rewardsPage.createAccount')}
          </Link>
        </div>
      </section>

      <h2 className="mt-8 text-lg font-bold uppercase tracking-wide text-ink-900">
        {t('rewardsPage.howYouEarn')}
      </h2>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <EarnCard
          icon={ShoppingBag}
          points={info.earn_points}
          delay={80}
          title={t('rewardsPage.orderTitle')}
          body={t('rewardsPage.orderBody', { perOrder })}
        />

        <EarnCard
          icon={Star}
          points={info.review_points}
          delay={140}
          title={t('rewardsPage.reviewTitle')}
          body={t('rewardsPage.reviewBody', { points: info.review_points })}
        />

        <EarnCard
          icon={UserCheck}
          points={info.profile_points}
          delay={200}
          title={t('rewardsPage.profileTitle')}
          body={t('rewardsPage.profileBody', { points: info.profile_points })}
        />

        <EarnCard
          icon={Cake}
          points={info.birthday_points}
          delay={260}
          title={t('rewardsPage.birthdayTitle')}
          body={t('rewardsPage.birthdayBody', { points: info.birthday_points })}
        />
      </div>

      <h2 className="mt-8 text-lg font-bold uppercase tracking-wide text-ink-900">
        {t('rewardsPage.worth')}
      </h2>

      <Card className="rise mt-3 divide-y divide-ink-100" style={{ animationDelay: '120ms' }}>
        <div className="flex items-start gap-3 p-4">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-accent-50 text-accent-700">
            <Wallet className="h-5 w-5" aria-hidden="true" />
          </span>

          <div>
            <p className="font-semibold text-ink-900">
              {t('rewardsPage.pointValue', { amount: money(info.point_value) })}
            </p>
            <p className="mt-0.5 text-sm text-ink-600">{t('rewardsPage.pointValueBody')}</p>
          </div>
        </div>

        <div className="p-4 text-sm text-ink-600">
          <ul className="flex flex-col gap-1.5">
            {info.min_redeem > 0 && (
              <li>
                <Emphasised text={t('rewardsPage.minRedeem')} value={info.min_redeem} />
              </li>
            )}

            {info.max_redeem > 0 && (
              <li>
                <Emphasised text={t('rewardsPage.maxRedeem')} value={info.max_redeem} />
              </li>
            )}

            {info.max_percent > 0 && (
              <li>
                <Emphasised text={t('rewardsPage.maxPercent')} value={`${info.max_percent}%`} />
              </li>
            )}
          </ul>
        </div>

        {info.expiry_days > 0 && (
          <div className="flex items-start gap-3 p-4">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-warning-50 text-warning-700">
              <Timer className="h-5 w-5" aria-hidden="true" />
            </span>

            <div>
              <p className="font-semibold text-ink-900">
                {t('rewardsPage.expiry', { days: info.expiry_days })}
              </p>
              <p className="mt-0.5 text-sm text-ink-600">{t('rewardsPage.expiryBody')}</p>
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}
