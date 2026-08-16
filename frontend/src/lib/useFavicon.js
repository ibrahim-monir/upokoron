import { useEffect } from 'react'

/**
 * Swaps the browser tab icon to the owner's uploaded favicon.
 *
 * The static <link> in index.html stays as the fallback -- this only
 * touches the DOM once a custom one is actually set, so a store that never
 * uploads one keeps the default and nothing flashes on load.
 */
export function useFavicon(url) {
  useEffect(() => {
    if (!url) return

    const link = document.querySelector("link[rel~='icon']") ?? document.createElement('link')

    link.rel = 'icon'
    link.href = url

    if (!link.isConnected) document.head.appendChild(link)
  }, [url])
}
