import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Gift, Tag } from 'lucide-react'
import { cx, money } from '../../lib/format'
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
  const toast = useToast()
  const [code, setCode] = useState('')

  const apply = useApplyCoupon()
  const remove = useRemoveCoupon()

  return (
    <div className="rounded-lg border border-ink-200 p-3">
      <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-500">
        <Tag className="h-3.5 w-3.5" aria-hidden="true" />
        Coupon code
      </p>

      {coupon ? (
        <div
          className={cx(
            'flex flex-wrap items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm',
            coupon.is_valid ? 'bg-accent-50 text-accent-700' : 'bg-warning-50 text-warning-700',
          )}
        >
          <span className="font-medium">
            {coupon.is_valid ? (
              <>
                “{coupon.code}” applied — you save {money(coupon.discount)}
              </>
            ) : (
              <>
                “{coupon.code}”: {coupon.message ?? 'no longer applies'}
              </>
            )}
          </span>
          <button
            type="button"
            onClick={() => remove.mutate()}
            disabled={remove.isPending}
            className="font-medium underline underline-offset-2 disabled:opacity-50"
          >
            Remove
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
              onError: (error) => toast.error(error?.message ?? 'That coupon could not be applied.'),
            })
          }}
        >
          <Input
            value={code}
            onChange={(event) => setCode(event.target.value.toUpperCase())}
            placeholder="Enter code"
            aria-label="Coupon code"
            className="w-full uppercase placeholder:normal-case"
          />
          <Button type="submit" variant="soft" className="w-full" loading={apply.isPending} disabled={!code.trim()}>
            Apply coupon
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
        Reward points
      </p>

      {!isAuthenticated ? (
        <div className="flex flex-col gap-2">
          <form
            className="grid gap-2"
            onSubmit={(event) => {
              event.preventDefault()

              if (!phone.trim()) return

              check.mutate(phone.trim(), {
                onError: (error) => toast.error(error?.message ?? 'Could not check that number.'),
              })
            }}
          >
            <Input
              type="tel"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="Your phone number"
              aria-label="Phone number"
              className="w-full"
            />
            <Button type="submit" variant="soft" className="w-full" loading={check.isPending} disabled={!phone.trim()}>
              Check balance
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
                  <span className="font-semibold">{check.data.balance} points</span> on this number.{' '}
                  <Link to="/login" className="font-medium underline underline-offset-2">
                    Log in
                  </Link>{' '}
                  to redeem them.
                </>
              ) : (
                'No reward points found for this number.'
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
            {rewardPoints.is_valid ? (
              <>
                {rewardPoints.points} points applied — you save {money(rewardPoints.discount)}
              </>
            ) : (
              <>{rewardPoints.points} points: {rewardPoints.message ?? 'no longer applies'}</>
            )}
          </span>
          <button
            type="button"
            onClick={() => remove.mutate()}
            disabled={remove.isPending}
            className="font-medium underline underline-offset-2 disabled:opacity-50"
          >
            Remove
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
              onError: (error) => toast.error(error?.message ?? 'Those points could not be redeemed.'),
            })
          }}
        >
          <p className="text-sm text-ink-600">
            You have <span className="font-semibold text-ink-900">{balance} points</span> available.
          </p>
          <Input
            type="number"
            min="1"
            max={balance}
            value={points}
            onChange={(event) => setPoints(event.target.value)}
            placeholder="Points to redeem"
            aria-label="Reward points to redeem"
            className="w-full"
          />
          <Button type="submit" variant="soft" className="w-full" loading={redeem.isPending} disabled={!points}>
            Redeem
          </Button>
        </form>
      ) : (
        <p className="text-sm text-ink-500">You don't have any reward points yet.</p>
      )}
    </div>
  )
}
