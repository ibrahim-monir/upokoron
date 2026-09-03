import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { cx } from '../lib/format'

/*
 * Candidate paths, tried in order.
 *
 * Several extensions are accepted because "save the file as logo.png" is an
 * instruction people reasonably follow with a .svg or a .webp, and a silently
 * missing logo is an annoying thing to debug.
 *
 * Note a missing file here does NOT 404: Vite (and the production SPA
 * fallback) answer any unknown path with index.html, so the <img> receives
 * HTML and fails to decode. That still fires onError, which is what moves us
 * down the list -- but it is why "the request succeeded" proves nothing.
 */
const CANDIDATES = ['/logo.png', '/logo.svg', '/logo.webp', '/logo.jpg']

/**
 * The store logo.
 *
 * The `store_logo` setting wins when set, so the owner can change it in
 * production without a rebuild. Otherwise the candidates above are tried, and
 * a lettered tile stands in if none load -- a broken-image icon in the header
 * is worse than a plain initial.
 *
 * `variant="light"` is for surfaces that are always dark -- the navy footer.
 * The wordmark is near-black and disappears there, so it is knocked out to
 * solid white. That loses the blue in the plug mark, which is the accepted
 * trade for legibility.
 *
 * `variant="header"` is for the one surface whose colour the shop picks. It
 * cannot commit to either treatment, so it follows the same brightness test
 * the header's ink does (lib/theme.js): knocked out on a dark bar, left as
 * drawn on a pale one. Hard-coding the white knockout here is what made the
 * logo vanish the day the bar turned pink.
 */
export function Logo({ settings, variant = 'natural', className, to = '/', showName = true }) {
  const configured = settings?.store_logo
  const sources = configured ? [configured, ...CANDIDATES] : CANDIDATES

  const [index, setIndex] = useState(0)

  // A newly saved setting should be tried again rather than staying on the
  // fallback from a previous render.
  useEffect(() => setIndex(0), [configured])

  const exhausted = index >= sources.length
  const storeName = settings?.store_name ?? 'Upokoron.com'

  useEffect(() => {
    if (exhausted && import.meta.env.DEV) {
      console.info(
        `[logo] No logo found. Save the artwork to frontend/public/logo.png ` +
          `(or set store_logo in Admin → Settings → Store). Tried: ${sources.join(', ')}`,
      )
    }
  }, [exhausted, sources])

  return (
    <Link to={to} className={cx('flex shrink-0 items-center gap-2.5', className)}>
      {exhausted ? (
        <>
          <span
            className={cx(
              'grid shrink-0 place-items-center rounded-lg font-bold',
              variant === 'light'
                ? 'h-11 w-11 bg-white/15 text-lg text-white ring-1 ring-white/25'
                : variant === 'header'
                  ? 'h-11 w-11 bg-header-line text-lg text-header-ink ring-1 ring-header-line'
                  : 'h-10 w-10 bg-brand-600 text-lg text-white',
            )}
          >
            {storeName.charAt(0).toUpperCase()}
          </span>

          {showName && (
            <span
              className={cx(
                'text-xl font-bold tracking-tight',
                variant === 'light' && 'text-white',
                variant === 'header' && 'text-header-ink',
                variant === 'natural' && 'text-ink-900',
              )}
            >
              {storeName}
            </span>
          )}
        </>
      ) : (
        <img
          src={sources[index]}
          alt={storeName}
          onError={() => setIndex((current) => current + 1)}
          className={cx(
            'h-10 w-auto object-contain',
            variant === 'light' && 'brightness-0 invert',
            variant === 'header' && '[filter:var(--header-logo-filter)]',
          )}
        />
      )}
    </Link>
  )
}
