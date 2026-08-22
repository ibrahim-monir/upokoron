import { useEffect } from 'react'
import { themeCss } from './theme'

const STYLE_ID = 'upokoron-theme'
const CACHE_KEY = 'upokoron.theme'

/**
 * Put the saved theme on the page.
 *
 * The block is appended to <head>, so it lands after the compiled stylesheet
 * and wins on source order without needing !important or a specificity
 * fight. One element, rewritten in place -- never a second <style> per
 * render, which is how a live colour picker ends up with hundreds of them.
 */
function applyTheme(css) {
  if (!css) return

  let element = document.getElementById(STYLE_ID)

  if (!element) {
    element = document.createElement('style')
    element.id = STYLE_ID
    document.head.append(element)
  }

  if (element.textContent !== css) element.textContent = css
}

/**
 * Paint the saved theme before React has rendered anything.
 *
 * Settings arrive over the network, so the first paint would otherwise use
 * the stylesheet's built-in colours and then visibly repaint once the
 * request lands. Caching the last known theme costs one localStorage read
 * and removes that flash entirely; a stale cache is corrected milliseconds
 * later by the real settings.
 *
 * Called from main.jsx, outside React.
 */
export function applyCachedTheme() {
  try {
    applyTheme(localStorage.getItem(CACHE_KEY) ?? '')
  } catch {
    // Private browsing, or storage disabled. The defaults are still fine.
  }
}

/*
 * These hooks depend on the compiled CSS string rather than the settings
 * object. The object is a fresh reference on every render, so depending on
 * it would rewrite the stylesheet constantly; the string is stable for as
 * long as the colours are, which is exactly the condition that matters.
 */

/** Keep the document in step with the store's saved colours. */
export function useTheme(settings) {
  const css = themeCss(settings)

  useEffect(() => {
    if (!css) return

    applyTheme(css)

    try {
      localStorage.setItem(CACHE_KEY, css)
    } catch {
      // Not being able to cache it only costs a flash on the next load.
    }
  }, [css])
}

/**
 * Preview a theme without saving it, for the settings screen.
 *
 * Applies on every change and puts the saved colours back when the screen
 * unmounts, so navigating away from an unsaved experiment does not leave the
 * admin panel wearing it.
 */
export function useThemePreview(draft, saved) {
  const draftCss = themeCss(draft)
  const savedCss = themeCss(saved)

  useEffect(() => {
    applyTheme(draftCss)
  }, [draftCss])

  useEffect(
    () => () => {
      if (savedCss) applyTheme(savedCss)
    },
    [savedCss],
  )
}
