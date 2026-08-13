import { useState } from 'react'
import { Link } from 'react-router-dom'
import { cx } from '../lib/format'

/**
 * The store logo.
 *
 * Source order: the `store_logo` setting (so the owner can change it in
 * production without a rebuild), falling back to /logo.png in the public
 * folder. If neither loads, a lettered tile stands in -- a broken-image icon
 * in the header is worse than a plain initial.
 *
 * `variant="light"` is for dark surfaces. The wordmark is near-black, which
 * disappears on the navy footer, so it is knocked out to solid white. That
 * loses the blue in the mark, which is the accepted trade for being legible.
 */
export function Logo({ settings, variant = 'natural', className, to = '/', showName = true }) {
  const [failed, setFailed] = useState(false)

  const storeName = settings?.store_name ?? 'Upokoron.com'
  const src = settings?.store_logo || '/logo.png'

  const content = failed ? (
    <>
      <span
        className={cx(
          'grid shrink-0 place-items-center rounded-lg font-bold',
          variant === 'light'
            ? 'h-11 w-11 bg-white/15 text-lg text-white ring-1 ring-white/25'
            : 'h-10 w-10 bg-brand-600 text-lg text-white',
        )}
      >
        {storeName.charAt(0).toUpperCase()}
      </span>

      {showName && (
        <span
          className={cx(
            'text-xl font-bold tracking-tight',
            variant === 'light' ? 'text-white' : 'text-ink-900',
          )}
        >
          {storeName}
        </span>
      )}
    </>
  ) : (
    <img
      src={src}
      alt={storeName}
      onError={() => setFailed(true)}
      className={cx(
        'w-auto object-contain',
        variant === 'light' ? 'h-10 brightness-0 invert' : 'h-10',
      )}
    />
  )

  return (
    <Link to={to} className={cx('flex shrink-0 items-center gap-2.5', className)}>
      {content}
    </Link>
  )
}
