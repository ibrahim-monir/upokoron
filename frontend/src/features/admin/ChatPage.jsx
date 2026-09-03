import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Archive, ArchiveRestore, Clock, Search, Send, User } from 'lucide-react'

import { get } from '../../lib/api'
import { cx, dateTime } from '../../lib/format'
import { useList, useWrite } from './useResource'
import { useAuthStore } from '../../stores/authStore'
import { Button, EmptyState, ErrorState, Input, Spinner } from '../../components/ui'

/**
 * How often the inbox asks for new messages.
 *
 * Polling, not sockets: this stack has no websocket server, and a support
 * inbox is not a trading screen -- five seconds late is a reply nobody
 * noticed was late. Only the open thread polls this fast; the list is
 * cheaper to be slightly stale about.
 */
const THREAD_POLL_MS = 5_000
const LIST_POLL_MS = 15_000

function initials(name) {
  return (name ?? '?')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('')
}

/** "2 min", "3 h", "12 Aug" -- the inbox reads better relative than exact. */
function ago(iso) {
  if (!iso) return ''

  const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000)

  if (seconds < 60) return 'now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min`
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)} h`

  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

function ConversationRow({ conversation, active, onSelect }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cx(
        'flex w-full items-center gap-3 border-b border-ink-100 px-3 py-3 text-left transition-colors',
        active ? 'bg-brand-50' : 'hover:bg-ink-50',
      )}
    >
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-100 text-xs font-bold text-brand-800">
        {initials(conversation.name ?? conversation.number)}
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className="truncate text-sm font-semibold text-ink-900">
            {conversation.name ?? conversation.number}
          </span>
          <span className="shrink-0 text-[11px] text-ink-400">{ago(conversation.last_message_at)}</span>
        </span>

        <span className="flex items-center justify-between gap-2">
          <span className="tabular truncate text-xs text-ink-500">{conversation.number}</span>

          {conversation.unread_count > 0 && (
            <span className="tabular grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-[#25d366] px-1.5 text-[11px] font-bold text-white">
              {conversation.unread_count}
            </span>
          )}
        </span>
      </span>
    </button>
  )
}

/** One message, sided and tinted the way every messaging app has taught. */
function Bubble({ message }) {
  const outbound = message.direction === 'out'

  return (
    <li className={cx('flex', outbound ? 'justify-end' : 'justify-start')}>
      <div
        className={cx(
          'max-w-[75%] rounded-xl px-3 py-2 text-sm shadow-sm',
          outbound ? 'rounded-br-sm bg-[#d9fdd3] text-ink-900' : 'rounded-bl-sm bg-white text-ink-900',
        )}
      >
        <p className="whitespace-pre-wrap break-words leading-snug">{message.body}</p>

        <p className="mt-1 flex items-center justify-end gap-1.5 text-[10px] text-ink-500">
          {message.sent_by && <span>{message.sent_by}</span>}
          <span>{dateTime(message.sent_at)}</span>
          {outbound && (
            <span className={message.status === 'failed' ? 'font-semibold text-danger-600' : ''}>
              {message.status}
            </span>
          )}
        </p>

        {message.error && <p className="mt-1 text-[11px] text-danger-600">{message.error}</p>}
      </div>
    </li>
  )
}

function Thread({ conversationId, canReply }) {
  const [draft, setDraft] = useState('')
  const bottom = useRef(null)

  const query = useQuery({
    queryKey: ['admin.chat', 'conversation', conversationId],
    queryFn: () => get(`/admin/chat/conversations/${conversationId}`),
    select: (response) => response.data,
    enabled: Boolean(conversationId),
    refetchInterval: THREAD_POLL_MS,
  })

  const write = useWrite('admin.chat', { successMessage: 'Sent.' })

  const conversation = query.data
  const messages = conversation?.messages ?? []

  // Follow the conversation down as it grows, the way a chat window should.
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' })
  }, [messages.length])

  if (query.isLoading) {
    return (
      <div className="grid flex-1 place-items-center">
        <Spinner />
      </div>
    )
  }

  if (query.isError) return <ErrorState error={query.error} onRetry={query.refetch} />

  const send = (event) => {
    event.preventDefault()

    const body = draft.trim()

    if (!body) return

    write.mutate(
      {
        url: `/admin/chat/conversations/${conversationId}/messages`,
        body: { body },
      },
      { onSuccess: () => setDraft('') },
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-ink-200 px-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-ink-900">
            {conversation.name ?? conversation.number}
          </p>
          <p className="tabular truncate text-xs text-ink-500">
            {conversation.number}
            {conversation.customer && ` · account #${conversation.customer.id}`}
          </p>
        </div>

        <Button
          size="sm"
          variant="secondary"
          onClick={() =>
            write.mutate({
              method: 'put',
              url: `/admin/chat/conversations/${conversationId}/archive`,
              body: { archived: !conversation.is_archived },
            })
          }
        >
          {conversation.is_archived ? (
            <>
              <ArchiveRestore className="h-4 w-4" />
              Reopen
            </>
          ) : (
            <>
              <Archive className="h-4 w-4" />
              Archive
            </>
          )}
        </Button>
      </div>

      <ul className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto bg-[#ece5dd] p-4">
        {messages.map((message) => (
          <Bubble key={message.id} message={message} />
        ))}
        <li ref={bottom} />
      </ul>

      <div className="border-t border-ink-200 p-3">
        {conversation.can_reply ? (
          <form className="flex items-end gap-2" onSubmit={send}>
            <textarea
              rows={2}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Write a reply"
              disabled={!canReply}
              // Enter sends, Shift+Enter breaks the line -- the habit every
              // messaging app has already taught whoever is on support.
              onKeyDown={(event) => {
                if (event.key !== 'Enter' || event.shiftKey) return
                event.preventDefault()
                send(event)
              }}
              className="min-h-0 flex-1 resize-none rounded-lg border border-ink-300 p-2.5 text-sm text-ink-900 placeholder:text-ink-400 hover:border-ink-400 disabled:bg-ink-100"
            />

            <Button type="submit" loading={write.isPending} disabled={!canReply || !draft.trim()}>
              <Send className="h-4 w-4" />
              Send
            </Button>
          </form>
        ) : (
          /*
           * WhatsApp's 24-hour customer service window. Said plainly, because
           * the alternative is staff typing a careful reply and being told
           * only on send that it was never going to arrive.
           */
          <p className="flex items-start gap-2 rounded-lg bg-warning-50 px-3 py-2.5 text-xs text-warning-800">
            <Clock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              WhatsApp only allows a free reply within 24 hours of the customer&apos;s last message, and
              that window has closed. They will have to write again before you can answer here — a phone
              call is the way to reach them meanwhile.
            </span>
          </p>
        )}
      </div>
    </div>
  )
}

/**
 * The WhatsApp support inbox.
 *
 * Worth being clear about what this screen is and is not: the customer is in
 * the WhatsApp app on their own phone, and always will be. A WhatsApp message
 * has to come from the number that sends it, so no website can host their
 * side of it. What CAN live here is the shop's side -- every conversation in
 * one place, answerable by whoever is on support rather than by whoever is
 * holding the shop phone.
 */
export default function ChatPage() {
  const can = useAuthStore((state) => state.can)

  const [search, setSearch] = useState('')
  const [archived, setArchived] = useState(false)
  const [activeId, setActiveId] = useState(null)

  const query = useList(
    'admin.chat',
    '/admin/chat/conversations',
    { search: search || undefined, archived: archived || undefined },
    { refetchInterval: LIST_POLL_MS },
  )

  const conversations = query.data?.data ?? []
  const isConfigured = query.data?.is_configured ?? true

  // Open the first thread on arrival, so the screen is never a list beside a
  // blank half-page.
  useEffect(() => {
    if (activeId === null && conversations.length > 0) setActiveId(conversations[0].id)
  }, [conversations, activeId])

  if (query.isError) return <ErrorState error={query.error} onRetry={query.refetch} />

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-ink-900">WhatsApp</h1>
        <p className="mt-0.5 text-sm text-ink-500">
          Customer conversations, answered from here instead of from the shop phone.
        </p>
      </div>

      {!isConfigured && (
        <div className="rounded-card border border-warning-200 bg-warning-50 p-4 text-sm text-warning-800">
          <p className="font-semibold">WhatsApp is not connected yet.</p>
          <p className="mt-1">
            Add the Cloud API credentials to the server environment —{' '}
            <code className="rounded bg-white/60 px-1">WHATSAPP_PHONE_NUMBER_ID</code>,{' '}
            <code className="rounded bg-white/60 px-1">WHATSAPP_TOKEN</code>,{' '}
            <code className="rounded bg-white/60 px-1">WHATSAPP_VERIFY_TOKEN</code> and{' '}
            <code className="rounded bg-white/60 px-1">WHATSAPP_APP_SECRET</code> — then point the Meta
            app&apos;s webhook at <code className="rounded bg-white/60 px-1">/api/v1/webhooks/whatsapp</code>.
            Messages arrive here once it is subscribed.
          </p>
        </div>
      )}

      <div className="flex h-[calc(100vh-14rem)] min-h-[30rem] overflow-hidden rounded-card border border-ink-200 bg-white">
        <div className="flex w-72 shrink-0 flex-col border-r border-ink-200">
          <div className="flex flex-col gap-2 border-b border-ink-200 p-3">
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400"
                aria-hidden="true"
              />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Name or number"
                aria-label="Search conversations"
                className="w-full pl-8"
              />
            </div>

            <label className="flex items-center gap-2 text-xs text-ink-600">
              <input
                type="checkbox"
                checked={archived}
                onChange={(event) => {
                  setArchived(event.target.checked)
                  setActiveId(null)
                }}
                className="h-3.5 w-3.5 rounded border-ink-300"
              />
              Show archived
            </label>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {query.isLoading ? (
              <div className="grid place-items-center py-10">
                <Spinner />
              </div>
            ) : conversations.length === 0 ? (
              <p className="px-3 py-8 text-center text-sm text-ink-500">
                {archived ? 'Nothing archived.' : 'No conversations yet.'}
              </p>
            ) : (
              conversations.map((conversation) => (
                <ConversationRow
                  key={conversation.id}
                  conversation={conversation}
                  active={conversation.id === activeId}
                  onSelect={() => setActiveId(conversation.id)}
                />
              ))
            )}
          </div>
        </div>

        {activeId ? (
          <Thread key={activeId} conversationId={activeId} canReply={can('chat.reply')} />
        ) : (
          <div className="grid flex-1 place-items-center">
            <EmptyState
              icon={User}
              title="No conversation open"
              description="Pick someone from the list to read what they asked."
            />
          </div>
        )}
      </div>
    </div>
  )
}
