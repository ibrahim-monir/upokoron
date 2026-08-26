import { Link, Navigate } from 'react-router-dom'
import { Cake, Gift, ShoppingBag, Star, Timer, UserCheck, Wallet } from 'lucide-react'

import { money } from '../../lib/format'
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

  const query = useRewardInfo()

  if (query.isLoading) return <PageLoader />

  const info = query.data

  // A shop can run the programme quietly. When it does, this page is not
  // "empty" -- it does not exist.
  if (!info?.advertised) return <Navigate to="/" replace />

  const perOrder = `${info.earn_points} point${info.earn_points === 1 ? '' : 's'} for every ${money(info.earn_per_amount)} you spend`

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
            Reward points
          </span>

          <h1 className="mt-4 text-3xl font-bold leading-tight sm:text-4xl">
            Earn as you shop. Spend it next time.
          </h1>

          <p className="mt-3 text-white/85">
            Every delivered order earns {perOrder}. Points come off the bill on a later order —
            no card, no coupon to remember.
          </p>

          <Link
            to={user ? '/account?section=rewards' : '/register'}
            className="mt-6 inline-flex items-center gap-2 rounded-lg bg-white px-5 py-2.5 text-sm font-semibold text-brand-800 transition-colors hover:bg-brand-50"
          >
            {user ? 'See my points' : 'Create an account to start earning'}
          </Link>
        </div>
      </section>

      <h2 className="mt-8 text-lg font-bold uppercase tracking-wide text-ink-900">
        How you earn
      </h2>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <EarnCard
          icon={ShoppingBag}
          points={info.earn_points}
          delay={80}
          title="On every order"
          body={`${perOrder}, credited once the order is delivered.`}
        />

        <EarnCard
          icon={Star}
          points={info.review_points}
          delay={140}
          title="For a review"
          body={`${info.review_points} points for each review we publish of something you bought.`}
        />

        <EarnCard
          icon={UserCheck}
          points={info.profile_points}
          delay={200}
          title="For completing your profile"
          body={`${info.profile_points} points, once, when your name, number and birthday are on file.`}
        />

        <EarnCard
          icon={Cake}
          points={info.birthday_points}
          delay={260}
          title="On your birthday"
          body={`${info.birthday_points} points a year, on the day.`}
        />
      </div>

      <h2 className="mt-8 text-lg font-bold uppercase tracking-wide text-ink-900">
        What they are worth
      </h2>

      <Card className="rise mt-3 divide-y divide-ink-100" style={{ animationDelay: '120ms' }}>
        <div className="flex items-start gap-3 p-4">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-accent-50 text-accent-700">
            <Wallet className="h-5 w-5" aria-hidden="true" />
          </span>

          <div>
            <p className="font-semibold text-ink-900">
              1 point = {money(info.point_value)}
            </p>
            <p className="mt-0.5 text-sm text-ink-600">
              Taken off the total at checkout. Nothing to type in.
            </p>
          </div>
        </div>

        <div className="p-4 text-sm text-ink-600">
          <ul className="flex flex-col gap-1.5">
            {info.min_redeem > 0 && (
              <li>
                You can spend points once you have <strong className="font-semibold text-ink-900">{info.min_redeem}</strong>.
              </li>
            )}

            {info.max_redeem > 0 && (
              <li>
                Up to <strong className="font-semibold text-ink-900">{info.max_redeem}</strong> points on a single order.
              </li>
            )}

            {info.max_percent > 0 && (
              <li>
                Points can cover up to{' '}
                <strong className="font-semibold text-ink-900">{info.max_percent}%</strong> of an
                order — the rest is paid as usual.
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
                Points last {info.expiry_days} days
              </p>
              <p className="mt-0.5 text-sm text-ink-600">
                Counted from the day they were earned, and the oldest are always spent first.
              </p>
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}
