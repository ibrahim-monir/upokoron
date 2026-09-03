import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Send, X } from 'lucide-react'
import { WhatsAppIcon } from './BrandIcons'
import { Textarea } from './ui'

/**
 * The shop's WhatsApp number in the form wa.me expects.
 *
 * Owners type their own number the way they say it -- 01712345678,
 * +880 1712-345678, 880 1712 345678 -- and wa.me accepts none of those but
 * the last. A local 01... number sent as-is opens a chat with nobody, which
 * is a broken support button that still looks like a working one, so the
 * conversion happens here rather than in the owner's head.
 *
 * A number that already carries some other country's code is left alone: this
 * shop is in Bangladesh, but the assumption stops at numbers that look local.
 */
function whatsappNumber(raw) {
  const digits = String(raw ?? '').replace(/\D/g, '')

  if (digits === '') return ''

  // 01712345678 -> 1712345678
  const national = digits.startsWith('0') ? digits.replace(/^0+/, '') : digits

  if (national.startsWith('880')) return national

  return /^1[3-9]\d{8}$/.test(national) ? `880${national}` : national
}

/**
 * Chat support, in the corner of every storefront page.
 *
 * The panel is where the customer writes; WhatsApp is where the conversation
 * happens. It cannot be otherwise: web.whatsapp.com refuses to be framed, and
 * showing real messages inside the page needs the WhatsApp Business Cloud API
 * -- business verification, a registered number, webhooks and template rules
 * -- none of which a shop wants standing between it and a question about a
 * charger. So this composes in place and hands off once, on send.
 *
 * That hand-off is stated on the button rather than hidden. A panel that says
 * "Send" and quietly opens another tab leaves the customer unsure whether
 * anyone received the message, which is the exact doubt support exists to
 * remove.
 */
export function WhatsAppChat({ settings }) {
  const { pathname, search } = useLocation()

  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const box = useRef(null)

  const greeting = settings?.store_whatsapp_greeting?.trim() ?? ''

  // Escape closes it, the same as every other overlay on the storefront.
  useEffect(() => {
    if (!open) return undefined

    const onKey = (event) => {
      if (event.key === 'Escape') setOpen(false)
    }

    window.addEventListener('keydown', onKey)

    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  // Opening puts the cursor in the box with the greeting already written, so
  // the shortest path -- open, send -- takes two clicks and no typing.
  useEffect(() => {
    if (!open) return

    setDraft((current) => current || greeting)
    box.current?.focus()
  }, [open, greeting])

  const number = whatsappNumber(settings?.store_whatsapp)

  // The number is the switch. No number, no button -- a support button that
  // opens an empty conversation is worse than none at all.
  if (number === '') return null

  const label = settings?.store_whatsapp_label?.trim()
  const welcome = settings?.store_whatsapp_welcome?.trim()

  const send = (event) => {
    event.preventDefault()

    // The page they were on travels with the message. Support's first
    // question is always "which product?", and a customer who has to answer
    // it has already been made to do the shop's work.
    const page = pathname === '/' ? null : `${window.location.origin}${pathname}${search}`
    const message = [draft.trim(), page].filter(Boolean).join('\n\n')

    const href = message
      ? `https://wa.me/${number}?text=${encodeURIComponent(message)}`
      : `https://wa.me/${number}`

    window.open(href, '_blank', 'noopener,noreferrer')
    setOpen(false)
  }

  return (
    <>
      {open && (
        <div
          role="dialog"
          aria-label="Chat with us on WhatsApp"
          className="w-[min(20rem,calc(100vw-2.5rem))] overflow-hidden rounded-card border border-ink-200 bg-white shadow-raised"
        >
          <div className="flex items-center gap-2.5 bg-[#075e54] px-3.5 py-3 text-white">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/15">
              <WhatsAppIcon className="h-5 w-5" />
            </span>

            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{settings?.store_name ?? 'Support'}</p>
              <p className="truncate text-xs text-white/70">
                {settings?.store_support_hours?.trim() || 'Usually replies quickly'}
              </p>
            </div>

            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close chat"
              className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-white/80 hover:bg-white/15 hover:text-white"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          {welcome && (
            // One bubble on the shop's side, so the panel reads as a
            // conversation already begun rather than a form to fill in.
            <div className="bg-[#ece5dd] px-3 py-4">
              <p className="max-w-[85%] rounded-xl rounded-tl-sm bg-white px-3 py-2 text-sm leading-snug text-ink-800 shadow-sm">
                {welcome}
              </p>
            </div>
          )}

          <form onSubmit={send} className="flex flex-col gap-2 border-t border-ink-200 p-3">
            <Textarea
              ref={box}
              rows={3}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Write your message"
              className="min-h-0"
              // Enter sends, Shift+Enter breaks the line -- the habit every
              // messaging app has already taught this customer.
              onKeyDown={(event) => {
                if (event.key !== 'Enter' || event.shiftKey) return
                event.preventDefault()
                send(event)
              }}
            />

            <button
              type="submit"
              className="flex h-10 items-center justify-center gap-2 rounded-lg bg-[#25d366] text-sm font-semibold text-white transition-colors hover:bg-[#1eb658]"
            >
              <Send className="h-4 w-4" aria-hidden="true" />
              Send on WhatsApp
            </button>

            <p className="text-[11px] leading-snug text-ink-500">
              Opens WhatsApp with your message ready to send, along with the page you are on.
            </p>
          </form>
        </div>
      )}

      {/*
        A circle on a phone and a labelled pill from sm up. The label is what
        turns a green dot into an offer of help, but on a narrow screen it
        would sit on top of the content it is meant to support.
      */}
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-label={label ? `${label} on WhatsApp` : 'Chat with us on WhatsApp'}
        className="flex h-12 items-center gap-2 rounded-full bg-[#25d366] px-3.5 text-white shadow-raised transition-transform hover:scale-105"
      >
        {open ? (
          <X className="h-6 w-6 shrink-0" aria-hidden="true" />
        ) : (
          <WhatsAppIcon className="h-6 w-6 shrink-0" />
        )}
        {label && !open && <span className="hidden pr-1 text-sm font-semibold sm:inline">{label}</span>}
      </button>
    </>
  )
}
