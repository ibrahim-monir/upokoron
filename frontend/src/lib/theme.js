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
/** WCAG relative luminance. Green carries most of what the eye reads as brightness. */
function luminance(rgb) {
  const [r, g, b] = rgb.map((channel) => {
    const c = channel / 255

    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })

  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)

  return (hi + 0.05) / (lo + 0.05)
}

/**
 * Softened text that still clears AA on its background.
 *
 * Pure white or black on a coloured bar is harsh, so the ink is mixed back
 * towards the bar. How far it can go depends on the bar: a pale pink will
 * take a lot, a saturated mid-tone almost none. Fixing the amount is what
 * made a crimson header fail at 3.98:1 -- so the amount is searched instead,
 * taking the softest step that still reads.
 */
function readableInk(bar, towards, softest) {
  for (const amount of [softest, 0.24, 0.18, 0.12, 0.06, 0]) {
    if (amount > softest) continue

    const candidate = parseHex(mix(towards, bar, amount))

    if (contrast(bar, candidate) >= 4.5) return toHex(candidate)
  }

  return toHex(towards)
}

/**
 * The logo bar, and text that stays readable on it.
 *
 * The ink is chosen from the bar's own brightness rather than fixed, so a
 * shop can put a pale pink up there without every link on it disappearing.
 * Both weights are then held at 4.5:1 whatever colour is chosen, which is
 * the point of deriving them rather than storing them: nobody picking a
 * header colour should have to also work out what text survives on it.
 */
export function headerRamp(header) {
  const bar = parseHex(header)

  if (bar === null) return {}

  // Whichever of black and white actually reads on this bar, not whichever
  // the brightness suggests. A mid-tone blue looks dark enough for white
  // text and gives it only 3.76:1, while black on the same blue clears 5.8.
  const towards = contrast(bar, BLACK) >= contrast(bar, WHITE) ? BLACK : WHITE
  const light = towards === BLACK

  return {
    '': toHex(bar),
    ink: readableInk(bar, towards, 0.12),
    // The quieter links: as soft as still reads, and no softer.
    muted: readableInk(bar, towards, 0.35),
    // Dividers and hover fills, as a translucent ink so they sit on the bar
    // whatever colour it is.
    line: light ? '#00000026' : '#ffffff26',
  }
}

export function themeCss(settings) {
  const primary = settings?.theme_primary
  const primaryDark = settings?.theme_primary_dark
  const background = settings?.theme_background
  const dark = settings?.theme_dark
  const header = settings?.theme_header

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

  // --color-header itself, plus the three that have to read on it. The empty
  // step is the bare token rather than a numbered one.
  for (const [step, hex] of Object.entries(headerRamp(header))) {
    declarations.push(step === '' ? `--color-header:${hex}` : `--color-header-${step}:${hex}`)
  }

  return declarations.length > 0 ? `:root{${declarations.join(';')}}` : ''
}
