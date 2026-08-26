import { useState } from 'react'
import { Mail, MailOpen, Phone, Trash2 } from 'lucide-react'

import { cx, dateTime } from '../../lib/format'
import { useList, useWrite } from './useResource'
import { useAuthStore } from '../../stores/authStore'
import { Badge, Button, Card, EmptyState, ErrorState, Pagination, Spinner } from '../../components/ui'

/**
 * Enquiries from the contact page.
 *
 * Read-and-reply happens outside the panel -- by phone, or by email -- so
 * this screen only has to make a message findable and let it be marked
 * dealt with. Unread first, because that is the whole question the screen
 * answers.
 */
export default function ContactMessagesPage() {
  const can = useAuthStore((state) => state.can)
  const [page, setPage] = useState(1)
  const [unreadOnly, setUnreadOnly] = useState(false)

  const query = useList('admin.contact-messages', '/admin/contact-messages', {
    page,
    unread_only: unreadOnly || undefined,
  })

  const write = useWrite('admin.contact-messages')

  const messages = query.data?.data ?? []
  const unread = query.data?.unread ?? 0

  const setRead = (message, isRead) =>
    write.mutate({
      method: 'put',
      url: `/admin/contact-messages/${message.id}/status`,
      body: { is_read: isRead },
    })

  const remove = (message) => {
    if (!window.confirm(`Delete the message from ${message.name}?`)) return

    write.mutate({ method: 'delete', url: `/admin/contact-messages/${message.id}` })
  }

  if (query.isError) return <ErrorState error={query.error} onRetry={query.refetch} />

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink-900">Messages</h1>
          <p className="mt-0.5 text-sm text-ink-500">
            Sent from the contact page.{' '}
            {unread > 0
              ? `${unread} still unread.`
              : 'Nothing waiting.'}
          </p>
        </div>

        <Button
          variant={unreadOnly ? 'primary' : 'secondary'}
          size="sm"
          onClick={() => {
            setUnreadOnly((value) => !value)
            setPage(1)
          }}
        >
          {unreadOnly ? 'Showing unread' : 'Show unread only'}
        </Button>
      </div>

      {query.isLoading ? (
        <div className="grid place-items-center py-16">
          <Spinner />
        </div>
      ) : messages.length === 0 ? (
        <EmptyState
          icon={Mail}
          title={unreadOnly ? 'Nothing unread' : 'No messages yet'}
          description={
            unreadOnly
              ? 'Every message has been marked as read.'
              : 'Messages sent from the contact page will appear here.'
          }
        />
      ) : (
        <>
          <div className="flex flex-col gap-3">
            {messages.map((message) => (
              <Card
                key={message.id}
                className={cx('p-4', !message.is_read && 'border-brand-300 bg-brand-50/40')}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-ink-900">{message.name}</p>

                      {!message.is_read && <Badge tone="brand">New</Badge>}
                    </div>

                    {/* The reply routes, as links -- answering is the point. */}
                    <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                      {message.phone && (
                        <a
                          href={`tel:${message.phone}`}
                          className="flex items-center gap-1.5 text-brand-800 hover:underline"
                        >
                          <Phone className="h-3.5 w-3.5" aria-hidden="true" />
                          {message.phone}
                        </a>
                      )}

                      {message.email && (
                        <a
                          href={`mailto:${message.email}`}
                          className="flex items-center gap-1.5 text-brand-800 hover:underline"
                        >
                          <Mail className="h-3.5 w-3.5" aria-hidden="true" />
                          {message.email}
                        </a>
                      )}

                      <span className="text-ink-500">{dateTime(message.created_at)}</span>
                    </div>
                  </div>

                  {can('contact.manage') && (
                    <div className="flex shrink-0 items-center gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setRead(message, !message.is_read)}
                      >
                        <MailOpen className="h-4 w-4" aria-hidden="true" />
                        {message.is_read ? 'Mark unread' : 'Mark read'}
                      </Button>

                      <Button variant="ghost" size="icon" onClick={() => remove(message)}>
                        <Trash2 className="h-4 w-4 text-danger-700" aria-hidden="true" />
                      </Button>
                    </div>
                  )}
                </div>

                {message.subject && (
                  <p className="mt-3 text-sm font-medium text-ink-800">{message.subject}</p>
                )}

                <p className="mt-1.5 whitespace-pre-line text-sm leading-6 text-ink-700">
                  {message.message}
                </p>
              </Card>
            ))}
          </div>

          <Pagination meta={query.data?.meta} onPage={setPage} />
        </>
      )}
    </div>
  )
}
