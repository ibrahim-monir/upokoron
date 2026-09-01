import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Gift, Tag } from 'lucide-react'
import { cx, money } from '../../lib/format'
import { useTranslation } from '../../lib/i18n'
import { Button, Input, useToast } from '../../components/ui'
import { useAuthStore } from '../../stores/authStore'
import {
  useApplyCoupon,
  useRedeemRewardPoints,
  useRemoveCoupon,
  useRemoveRewardPoints,
  useRewardBalanceByPhone,
} from './useCart'

/**
 * A code typed once, applied to the whole cart, and removable with one
 * click. Shared between the cart and checkout pages -- both show the same
 * server-side cart, just from different angles.
 */
export function CouponBox({ coupon }) {
  const { t } = useTranslation()
  const toast = useToast()
  const [code, setCode] = useState('')

  const apply = useApplyCoupon()
  const remove = useRemoveCoupon()

  return (
    <div className="rounded-lg border border-ink-200 p-3">
      <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-500">
        <Tag className="h-3.5 w-3.5" aria-hidden="true" />
        {t('coupon.title')}
      </p>

      {coupon ? (
        <div
          className={cx(
            'flex flex-wrap items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm',
            coupon.is_valid ? 'bg-accent-50 text-accent-700' : 'bg-warning-50 text-warning-700',
          )}
        >
          <span className="font-medium">
            {coupon.is_valid
              ? t('coupon.applied', { code: coupon.code, amount: money(coupon.discount) })
              : t('coupon.invalid', { code: coupon.code, message: coupon.message ?? t('coupon.noLongerApplies') })}
          </span>
          <button
            type="button"
            onClick={() => remove.mutate()}
            disabled={remove.isPending}
            className="font-medium underline underline-offset-2 disabled:opacity-50"
          >
            {t('coupon.remove')}
          </button>
        </div>
      ) : (
        <form
          className="grid gap-2"
          onSubmit={(event) => {
            event.preventDefault()

            if (!code.trim()) return

            apply.mutate(code.trim(), {
              onSuccess: () => setCode(''),
              onError: (error) => toast.error(error?.message ?? t('coupon.applyFailed')),
            })
          }}
        >
          <Input
            value={code}
            onChange={(event) => setCode(event.target.value.toUpperCase())}
            placeholder={t('coupon.enterCode')}
            aria-label={t('coupon.title')}
            className="w-full uppercase placeholder:normal-case"
          />
          <Button type="submit" variant="soft" className="w-full" loading={apply.isPending} disabled={!code.trim()}>
            {t('coupon.apply')}
          </Button>
        </form>
      )}
    </div>
  )
}

/**
 * Spend loyalty points for a discount, the same one-code-in-one-click-out
 * shape as the coupon box above it.
 *
 * Signed out, there is no cart-linked balance to spend, so this shows a
 * phone-number balance lookup instead -- no login, no code sent to prove
 * the number is theirs, just a number to answer "is logging in worth it".
 * Redeeming still requires an account; the server enforces that too.
 */
export function RewardPointsBox({ rewardPoints, balance }) {
  const { t } = useTranslation()
  const toast = useToast()
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const [points, setPoints] = useState('')
  const [phone, setPhone] = useState('')

  const redeem = useRedeemRewardPoints()
  const remove = useRemoveRewardPoints()
  const check = useRewardBalanceByPhone()

  return (
    <div className="rounded-lg border border-ink-200 p-3">
      <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-500">
        <Gift className="h-3.5 w-3.5" aria-hidden="true" />
        {t('reward.title')}
      </p>

      {!isAuthenticated ? (
        <div className="flex flex-col gap-2">
          <form
            className="grid gap-2"
            onSubmit={(event) => {
              event.preventDefault()

              if (!phone.trim()) return

              check.mutate(phone.trim(), {
                onError: (error) => toast.error(error?.message ?? t('reward.checkFailed')),
              })
            }}
          >
            <Input
              type="tel"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder={t('reward.phonePlaceholder')}
              aria-label={t('reward.phoneAriaLabel')}
              className="w-full"
            />
            <Button type="submit" variant="soft" className="w-full" loading={check.isPending} disabled={!phone.trim()}>
              {t('reward.checkBalance')}
            </Button>
          </form>

          {check.isSuccess && (
            <div
              className={cx(
                'rounded-lg px-3 py-2 text-sm',
                check.data.balance > 0 ? 'bg-accent-50 text-accent-700' : 'bg-ink-50 text-ink-600',
              )}
            >
              {check.data.balance > 0 ? (
                <>
                  <span className="font-semibold">{check.data.balance}</span>{' '}
                  {t('reward.pointsOnNumberSuffix')}{' '}
                  <Link to="/login" className="font-medium underline underline-offset-2">
                    {t('reward.logIn')}
                  </Link>{' '}
                  {t('reward.toRedeemThem')}
                </>
              ) : (
                t('reward.noneFound')
              )}
            </div>
          )}
        </div>
      ) : rewardPoints ? (
        <div
          className={cx(
            'flex flex-wrap items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm',
            rewardPoints.is_valid ? 'bg-accent-50 text-accent-700' : 'bg-warning-50 text-warning-700',
          )}
        >
          <span className="font-medium">
            {rewardPoints.is_valid
              ? t('reward.appliedPoints', { points: rewardPoints.points, amount: money(rewardPoints.discount) })
              : t('reward.invalidPoints', {
                  points: rewardPoints.points,
                  message: rewardPoints.message ?? t('coupon.noLongerApplies'),
                })}
          </span>
          <button
            type="button"
            onClick={() => remove.mutate()}
            disabled={remove.isPending}
            className="font-medium underline underline-offset-2 disabled:opacity-50"
          >
            {t('coupon.remove')}
          </button>
        </div>
      ) : balance > 0 ? (
        <form
          className="grid gap-2"
          onSubmit={(event) => {
            event.preventDefault()

            const requested = parseInt(points, 10)
            if (!requested || requested <= 0) return

            redeem.mutate(requested, {
              onSuccess: () => setPoints(''),
              onError: (error) => toast.error(error?.message ?? t('reward.redeemFailed')),
            })
          }}
        >
          <p className="text-sm text-ink-600">
            {t('reward.youHave')} <span className="font-semibold text-ink-900">{balance}</span>{' '}
            {t('reward.pointsAvailableSuffix')}
          </p>
          <Input
            type="number"
            min="1"
            max={balance}
            value={points}
            onChange={(event) => setPoints(event.target.value)}
            placeholder={t('reward.pointsToRedeemPlaceholder')}
            aria-label={t('reward.pointsToRedeemAriaLabel')}
            className="w-full"
          />
          <Button type="submit" variant="soft" className="w-full" loading={redeem.isPending} disabled={!points}>
            {t('reward.redeem')}
          </Button>
        </form>
      ) : (
        <p className="text-sm text-ink-500">{t('reward.none')}</p>
      )}
    </div>
  )
}
