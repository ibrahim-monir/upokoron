import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from '../../lib/i18n'
import { Button } from '../../components/ui'

/**
 * Asked for when someone opens an order link without a session and without
 * the phone number in the URL -- a bookmarked confirmation, or a link
 * forwarded to a family member.
 */
export function PhoneGate({ number, onSubmit, error }) {
  const { t } = useTranslation()
  const [phone, setPhone] = useState('')

  return (
    <div className="mx-auto max-w-md rounded-card border border-ink-200 bg-white p-5">
      <h1 className="text-lg font-semibold text-ink-900">{t('phoneGate.title', { number })}</h1>
      <p className="mt-1 text-sm text-ink-600">
        {t('phoneGate.bodyPrefix')}{' '}
        <Link to="/login" className="font-medium text-brand-800 hover:underline">
          {t('phoneGate.signIn')}
        </Link>
        .
      </p>

      <form
        className="mt-4 flex flex-col gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          onSubmit(phone.trim())
        }}
      >
        <input
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          placeholder="01XXXXXXXXX"
          inputMode="tel"
          aria-label={t('phoneGate.mobileAriaLabel')}
          className="h-10 rounded-lg border border-ink-200 px-3 text-sm text-ink-900 placeholder:text-ink-400"
        />
        <Button type="submit" disabled={!phone.trim()}>
          {t('phoneGate.showOrder')}
        </Button>
      </form>

      {error && <p className="mt-3 text-sm text-danger-700">{error}</p>}
    </div>
  )
}
