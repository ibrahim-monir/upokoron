/*
 * Runtime theming.
 *
 * Tailwind's `@theme` block compiles to real custom properties on :root, and
 * every colour utility reads them through var(). So redefining those same
 * properties later in the document re-colours the entire interface --
 * storefront and admin both -- with no rebuild and no reload.
 *
 * Four colours are stored; the ~30 the interface uses are derived here. A
 * palette is a system, not a list: asking someone to hand-pick eleven blues
 * is how a ramp ends up with steps that do not belong to each other.
 */

const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i

/** '#0082FB' -> [0, 130, 251]. Returns null for anything that is not a hex colour. */
export function parseHex(value) {
  if (typeof value !== 'string' || !HEX.test(value.trim())) return null

  let hex = value.trim().replace('#', '')

  if (hex.length === 3) {
    hex = hex
      .split('')
      .map((char) => char + char)
      .join('')
  }

  return [0, 2, 4].map((index) => parseInt(hex.slice(index, index + 2), 16))
}

function toHex([r, g, b]) {
  return (
    '#' +
    [r, g, b]
      .map((channel) => Math.round(Math.min(255, Math.max(0, channel))).toString(16).padStart(2, '0'))
      .join('')
  )
}

/** Blend two colours. `amount` 0 returns `from`, 1 returns `to`. */
function mix(from, to, amount) {
  return toHex(from.map((channel, index) => channel + (to[index] - channel) * amount))
}

const WHITE = [255, 255, 255]
const BLACK = [0, 0, 0]

/*
 * The brand ramp.
 *
 * 600 and 700 are the two colours actually chosen -- they sit at those
 * numbers because Button reads bg-600 -> hover:700 -> active:800, so the
 * stored pair lands on the components with nothing to translate. Lighter
 * steps blend to white for fills and tints; darker steps blend to black,
 * and carry the text weight, since a vivid mid-tone rarely clears 4.5:1 on
 * white however nice it looks as a button.
 */
const BRAND_LIGHTER = { 50: 0.94, 100: 0.86, 200: 0.72, 300: 0.54, 400: 0.32, 500: 0.14 }
const BRAND_DARKER = { 800: 0.18, 900: 0.36, 950: 0.62 }

export function brandRamp(primary, primaryDark) {
  const base = parseHex(primary)
  const dark = parseHex(primaryDark) ?? base

  if (!base) return {}

  const ramp = { 600: toHex(base), 700: toHex(dark) }

  for (const [step, amount] of Object.entries(BRAND_LIGHTER)) {
    ramp[step] = mix(base, WHITE, amount)
  }

  for (const [step, amount] of Object.entries(BRAND_DARKER)) {
    ramp[step] = mix(dark, BLACK, amount)
  }

  return ramp
}

/*
 * The neutral ramp, spanning the page background to the dark surface colour.
 *
 * Deriving greys from the two chosen ends rather than shipping a fixed grey
 * is what keeps them from reading as a second, unintended hue: a cool grey
 * beside a warm brand looks like a mistake, and vice versa.
 */
const INK_MIX = {
  100: 0.05,
  200: 0.13,
  300: 0.26,
  400: 0.46,
  500: 0.62,
  600: 0.74,
  700: 0.84,
  800: 0.93,
}

export function inkRamp(background, darkSurface) {
  const light = parseHex(background)
  const dark = parseHex(darkSurface)

  if (!light || !dark) return {}

  const ramp = { 50: toHex(light), 900: toHex(dark), 950: mix(dark, BLACK, 0.4) }

  for (const [step, amount] of Object.entries(INK_MIX)) {
    ramp[step] = mix(light, dark, amount)
  }

  return ramp
}

/** Header, footer, and admin chrome: the dark surface and two neighbours. */
export function darkRamp(darkSurface, background) {
  const dark = parseHex(darkSurface)
  const light = parseHex(background)

  if (!dark) return {}

  return {
    800: light ? mix(dark, light, 0.09) : mix(dark, WHITE, 0.09),
    900: toHex(dark),
    950: mix(dark, BLACK, 0.35),
  }
}

/**
 * The full override block for a saved theme.
 *
 * Returns '' when nothing is configured, so the stylesheet's own @theme
 * values stand rather than being replaced by a half-built ramp.
 */
export function themeCss(settings) {
  const primary = settings?.theme_primary
  const primaryDark = settings?.theme_primary_dark
  const background = settings?.theme_background
  const dark = settings?.theme_dark

  if (!parseHex(primary)) return ''

  const declarations = []

  const push = (prefix, ramp) => {
    for (const [step, hex] of Object.entries(ramp)) {
      declarations.push(`--color-${prefix}-${step}:${hex}`)
    }
  }

  push('brand', brandRamp(primary, primaryDark))

  if (parseHex(background) && parseHex(dark)) {
    push('ink', inkRamp(background, dark))
    push('navy', darkRamp(dark, background))
  }

  return declarations.length > 0 ? `:root{${declarations.join(';')}}` : ''
}
