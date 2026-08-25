import { useEffect } from 'react'

/**
 * Parses a raw HTML/script snippet and appends its nodes to `parent`.
 *
 * innerHTML alone will not execute a <script> tag the browser parsed that
 * way -- that is the whole reason "paste this snippet" scripts (Pixel, chat
 * widgets, GA itself) tell you to add them as real markup rather than build
 * them from a string. Each script node is rebuilt with createElement so it
 * actually runs; everything else (a <noscript><img> fallback, for example)
 * is just cloned in as-is.
 */
function appendSnippet(parent, html) {
  const template = document.createElement('template')
  template.innerHTML = html

  return Array.from(template.content.childNodes).map((node) => {
    let toAppend = node

    if (node.nodeName === 'SCRIPT') {
      const script = document.createElement('script')
      Array.from(node.attributes).forEach((attr) => script.setAttribute(attr.name, attr.value))
      script.textContent = node.textContent
      toAppend = script
    } else {
      toAppend = node.cloneNode(true)
    }

    parent.appendChild(toAppend)

    return toAppend
  })
}

/**
 * Raw code an owner pastes in Admin -> Settings -> Analytics & search
 * console, for anything the dedicated Google fields don't cover -- a
 * Facebook Pixel, a chat widget, a one-off verification snippet. Header
 * scripts land at the end of <head>; footer scripts land at the end of
 * <body>, matching where such snippets are conventionally told to go.
 */
export function useCustomScripts({ headerScripts, footerScripts } = {}) {
  useEffect(() => {
    if (!headerScripts) return undefined

    const nodes = appendSnippet(document.head, headerScripts)

    return () => nodes.forEach((node) => node.remove())
  }, [headerScripts])

  useEffect(() => {
    if (!footerScripts) return undefined

    const nodes = appendSnippet(document.body, footerScripts)

    return () => nodes.forEach((node) => node.remove())
  }, [footerScripts])
}
