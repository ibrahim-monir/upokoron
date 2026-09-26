/*
 * Money arrives from the API as a decimal STRING, never a number, because
 * the backend does all its arithmetic in bcmath to avoid float drift.
 * Formatting is the only place it becomes a number, and only to be printed.
 */

const TAKA = '৳'

export function money(value, { symbol = true, decimals = 2 } = {}) {
  const amount = Number(value ?? 0)

  if (Number.isNaN(amount)) return symbol ? `${TAKA}0.00` : '0.00'

  const formatted = amount.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })

  return symbol ? `${TAKA}${formatted}` : formatted
}

/** Quantities carry three decimals but read better trimmed: "3" not "3.000". */
export function quantity(value) {
  const amount = Number(value ?? 0)

  if (Number.isNaN(amount)) return '0'

  return amount.toLocaleString('en-US', { maximumFractionDigits: 3 })
}

export function percent(value, decimals = 1) {
  const amount = Number(value ?? 0)
  return `${Number.isNaN(amount) ? 0 : amount.toFixed(decimals)}%`
}

/*
 * Timestamps come back in UTC. The business thinks in Dhaka time, so every
 * displayed date is converted -- otherwise an evening order shows as
 * tomorrow for six hours each day.
 */
const TZ = 'Asia/Dhaka'

export function date(value, options = {}) {
  if (!value) return '—'

  return new Date(value).toLocaleDateString('en-GB', {
    timeZone: TZ,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    ...options,
  })
}

export function dateTime(value) {
  if (!value) return '—'

  return new Date(value).toLocaleString('en-GB', {
    timeZone: TZ,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * The value a `datetime-local` input wants, computed in the shop's own
 * timezone rather than the admin's browser.
 *
 * A `datetime-local` input has no timezone of its own -- `new Date(value)`
 * plus the browser-local getters (`getHours()` etc.) would render the
 * admin's own wall-clock time, not Dhaka's. Submitted back unchanged, that
 * silently drifts a publish date or a coupon's schedule by whatever offset
 * the admin's machine happens to be in every time the form is saved. The
 * backend (`App\Support\LocalDateTime`) interprets whatever this produces
 * as Dhaka time, so the two must agree on that.
 */
export function datetimeLocalValue(value) {
  if (!value) return ''

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) return ''

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date)

  const get = (type) => parts.find((part) => part.type === type)?.value

  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`
}

export function relativeTime(value) {
  if (!value) return '—'

  const seconds = Math.round((Date.now() - new Date(value).getTime()) / 1000)
  const formatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })

  const steps = [
    ['second', 60],
    ['minute', 60],
    ['hour', 24],
    ['day', 7],
    ['week', 4.345],
    ['month', 12],
    ['year', Infinity],
  ]

  let count = seconds

  for (const [unit, size] of steps) {
    if (Math.abs(count) < size) return formatter.format(-Math.round(count), unit)
    count /= size
  }

  return date(value)
}

/**
 * A list date the way WooCommerce shows one: "3 minutes ago" or "7 hours
 * ago" within the last day, where the gap is what matters, and a plain
 * "Aug 16, 2026" after that, where the day is.
 */
export function listDate(value) {
  if (!value) return '—'

  const minutes = Math.floor((Date.now() - new Date(value).getTime()) / 60_000)

  if (minutes >= 0 && minutes < 24 * 60) {
    if (minutes < 1) return 'Just now'
    if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`

    const hours = Math.floor(minutes / 60)
    return `${hours} hour${hours === 1 ? '' : 's'} ago`
  }

  return new Date(value).toLocaleDateString('en-US', {
    timeZone: TZ,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function initials(name = '') {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

/** Joins class names, dropping falsy ones. */
export function cx(...classes) {
  return classes.filter(Boolean).join(' ')
}
