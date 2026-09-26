import { useEffect } from 'react'

/**
 * This page's title, description and share tags, kept in <head> as the
 * visitor moves around the storefront.
 *
 * The first page load of a product or category arrives with these tags
 * already filled in by the server (PageMetaController), including its
 * structured data -- which is what Google and link previews read. This hook
 * keeps the tab title and tags right after that, as the app moves between
 * pages without reloading. It never adds structured data itself, and it
 * leaves the server's in place on the first page, so Google always sees it.
 */

export const SITE_NAME = 'Upokoron.com'

const DEFAULT_TITLE = 'Upokoron.com — Electronics for everyone'
const DEFAULT_DESCRIPTION =
  'Genuine electronics and accessories, stocked in Dhaka and delivered to your door. Cash on delivery available.'

/** "Name | Upokoron.com", or the home page title when there is no name. */
export function pageTitle(name) {
  return name ? `${name} | ${SITE_NAME}` : DEFAULT_TITLE
}

function plain(text, limit = 160) {
  if (!text) return ''

  const div = document.createElement('div')
  // Tags become spaces first, so neighbouring paragraphs do not run together.
  div.innerHTML = String(text).replace(/<[^>]*>/g, ' ')
  const flat = (div.textContent ?? '').replace(/\s+/g, ' ').trim()

  return flat.length > limit ? `${flat.slice(0, limit - 1)}…` : flat
}

function setTag(tag, attrs) {
  const element = document.createElement(tag)
  element.setAttribute('data-page-meta', '')

  for (const [key, value] of Object.entries(attrs)) element.setAttribute(key, value)

  document.head.appendChild(element)
}

/**
 * @param {null | { title?: string, description?: string, image?: string, type?: string }} meta
 *   null while the page's data is still loading -- nothing is touched until
 *   there is something true to say.
 */
export function usePageMeta(meta) {
  const title = meta?.title ?? null
  const description = meta ? plain(meta.description) || DEFAULT_DESCRIPTION : null
  const image = meta?.image ?? null
  const type = meta?.type ?? 'website'
  const ready = meta !== null

  useEffect(() => {
    if (!ready) return undefined

    document.title = title ?? DEFAULT_TITLE

    // Replace the tags (the server's, or the last page's) -- but keep the
    // server's structured data: it describes this very URL.
    document.head
      .querySelectorAll('[data-page-meta]:not(script), meta[name="description"]')
      .forEach((element) => element.remove())

    const url = window.location.origin + window.location.pathname

    setTag('meta', { name: 'description', content: description })
    setTag('link', { rel: 'canonical', href: url })
    setTag('meta', { property: 'og:type', content: type })
    setTag('meta', { property: 'og:site_name', content: SITE_NAME })
    setTag('meta', { property: 'og:title', content: title ?? DEFAULT_TITLE })
    setTag('meta', { property: 'og:description', content: description })
    setTag('meta', { property: 'og:url', content: url })
    if (image) setTag('meta', { property: 'og:image', content: new URL(image, window.location.origin).href })

    return () => {
      // Leaving the page: its tags, and its structured data, go with it.
      document.head.querySelectorAll('[data-page-meta]').forEach((element) => element.remove())
      document.title = DEFAULT_TITLE
      setTag('meta', { name: 'description', content: DEFAULT_DESCRIPTION })
    }
  }, [ready, title, description, image, type])
}
