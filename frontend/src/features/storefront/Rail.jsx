import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cx } from '../../lib/format'

/**
 * A single row that slides when its contents do not fit.
 *
 * A native scroller with snap points rather than a carousel library: it
 * costs nothing, it already works with a trackpad, a touch drag, and a
 * keyboard, and the arrows are then just a mouse affordance on top of
 * behaviour that exists either way.
 */
export function useRail(itemCount, { autoAdvanceMs = null } = {}) {
  const ref = useRef(null)
  const [overflow, setOverflow] = useState(false)
  const [atStart, setAtStart] = useState(true)
  const [atEnd, setAtEnd] = useState(false)

  /*
   * The arrows only exist when there is somewhere to go. Watched rather
   * than measured once, because the answer changes with the window and
   * again when the contents finally arrive.
   */
  const measure = useCallback(() => {
    const rail = ref.current

    if (!rail) return

    const max = rail.scrollWidth - rail.clientWidth

    setOverflow(max > 4)
    setAtStart(rail.scrollLeft <= 4)
    setAtEnd(rail.scrollLeft >= max - 4)
  }, [])

  useEffect(() => {
    measure()

    const rail = ref.current

    if (!rail) return undefined

    const observer = new ResizeObserver(measure)

    observer.observe(rail)
    rail.addEventListener('scroll', measure, { passive: true })

    return () => {
      observer.disconnect()
      rail.removeEventListener('scroll', measure)
    }
  }, [measure, itemCount])

  /*
   * One card per click.
   *
   * The step is measured from the DOM rather than hardcoded, because the
   * card width is a responsive class and the gap is a Tailwind token --
   * either can change without this file being touched. Two adjacent
   * children give width-plus-gap in one number; a single child falls back
   * to its own width.
   */
  const page = (direction) => {
    const rail = ref.current

    if (!rail) return

    const [first, second] = rail.children
    const step = second
      ? second.offsetLeft - first.offsetLeft
      : (first?.getBoundingClientRect().width ?? rail.clientWidth)

    rail.scrollBy({ left: direction * step, behavior: 'smooth' })
  }

  /*
   * Opt-in auto-advance, off unless a caller asks for it -- most rails
   * (related products, category pickers used for navigation) should sit
   * still until touched. It loops back to the start instead of stopping at
   * the end, and pauses on hover, touch, or keyboard focus so it never
   * fights someone actually using the manual controls: those keep working
   * exactly as before, this just nudges the row forward when idle.
   */
  useEffect(() => {
    if (!autoAdvanceMs) return undefined

    const rail = ref.current

    if (!rail) return undefined

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined

    let paused = false
    const pause = () => { paused = true }
    const resume = () => { paused = false }

    rail.addEventListener('mouseenter', pause)
    rail.addEventListener('mouseleave', resume)
    rail.addEventListener('touchstart', pause, { passive: true })
    rail.addEventListener('touchend', resume)
    rail.addEventListener('focusin', pause)
    rail.addEventListener('focusout', resume)

    const timer = setInterval(() => {
      if (paused) return

      const max = rail.scrollWidth - rail.clientWidth

      if (max <= 4) return

      if (rail.scrollLeft >= max - 4) {
        rail.scrollTo({ left: 0, behavior: 'smooth' })
      } else {
        page(1)
      }
    }, autoAdvanceMs)

    return () => {
      clearInterval(timer)
      rail.removeEventListener('mouseenter', pause)
      rail.removeEventListener('mouseleave', resume)
      rail.removeEventListener('touchstart', pause)
      rail.removeEventListener('touchend', resume)
      rail.removeEventListener('focusin', pause)
      rail.removeEventListener('focusout', resume)
    }
  }, [autoAdvanceMs, itemCount])

  return { ref, overflow, atStart, atEnd, page }
}

/**
 * The paired arrows a rail is driven by.
 *
 * Overlaid on the row and centred against it, so they sit level with the
 * cards they move rather than off in the heading. They straddle the edge --
 * half over the first card, half over the gutter -- which is what makes it
 * read as "there is more this way" instead of as a button that happens to
 * be nearby.
 *
 * Nothing renders when everything already fits, and an arrow disappears at
 * the end it cannot move towards: a dead control is worse than no control.
 */
export function RailArrows({ rail, label }) {
  if (!rail.overflow) return null

  const base =
    'absolute top-1/2 z-10 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full border border-ink-200 bg-white text-ink-700 shadow-raised transition hover:border-brand-600 hover:text-brand-800 disabled:pointer-events-none disabled:opacity-0'

  return (
    <>
      <button
        type="button"
        onClick={() => rail.page(-1)}
        disabled={rail.atStart}
        aria-label={`Previous ${label}`}
        className={cx(base, '-left-3')}
      >
        <ChevronLeft className="h-4.5 w-4.5" aria-hidden="true" />
      </button>

      <button
        type="button"
        onClick={() => rail.page(1)}
        disabled={rail.atEnd}
        aria-label={`More ${label}`}
        className={cx(base, '-right-3')}
      >
        <ChevronRight className="h-4.5 w-4.5" aria-hidden="true" />
      </button>
    </>
  )
}
