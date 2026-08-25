import { useEffect } from 'react'

/**
 * Wires the storefront's <head> to whatever the owner has configured in
 * Admin -> Settings -> Analytics & search console. Mirrors useFavicon's
 * pattern: mutate or create a node once the value is known, and do nothing
 * when it is blank, so a store that has not set these up gets no extra tags
 * at all.
 */
export function useAnalytics({ googleSiteVerification, googleAnalyticsId } = {}) {
  useEffect(() => {
    if (!googleSiteVerification) return

    const meta =
      document.querySelector("meta[name='google-site-verification']") ?? document.createElement('meta')

    meta.name = 'google-site-verification'
    meta.content = googleSiteVerification

    if (!meta.isConnected) document.head.appendChild(meta)
  }, [googleSiteVerification])

  useEffect(() => {
    if (!googleAnalyticsId) return
    // Tagged with the ID it loads, so this only runs once per ID rather
    // than stacking a second tracker under the first on every re-render.
    if (document.querySelector(`script[data-ga-id="${googleAnalyticsId}"]`)) return

    const loader = document.createElement('script')
    loader.async = true
    loader.dataset.gaId = googleAnalyticsId
    loader.src = `https://www.googletagmanager.com/gtag/js?id=${googleAnalyticsId}`
    document.head.appendChild(loader)

    const inline = document.createElement('script')
    inline.dataset.gaId = googleAnalyticsId
    inline.textContent =
      'window.dataLayer = window.dataLayer || [];' +
      'function gtag(){dataLayer.push(arguments);}' +
      `gtag('js', new Date());gtag('config', '${googleAnalyticsId}');`
    document.head.appendChild(inline)
  }, [googleAnalyticsId])
}
