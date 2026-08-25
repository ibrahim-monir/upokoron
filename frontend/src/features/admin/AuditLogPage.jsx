import { useState } from 'react'
import { ScrollText } from 'lucide-react'
import { useList } from './useResource'
import { dateTime } from '../../lib/format'
import {
  Badge,
  EmptyState,
  ErrorState,
  Pagination,
  Select,
  Spinner,
  TableWrap,
  Td,
  Th,
} from '../../components/ui'

const EVENT_TONE = {
  created: 'success',
  updated: 'brand',
  deleted: 'danger',
  login: 'neutral',
  login_failed: 'warning',
  password_changed: 'warning',
  reversed: 'warning',
}

const EVENTS = [
  '',
  'created',
  'updated',
  'deleted',
  'restored',
  'login',
  'login_failed',
  'logout',
  'password_changed',
]

/**
 * The log itself, with no page heading of its own.
 *
 * Rendered both as a standalone page (below) and as a tab on the settings
 * screen, which supplies its own title -- two headings stacked would be one
 * more than the page needs.
 */
export function AuditLog({ heading = null }) {
  const [page, setPage] = useState(1)
  const [event, setEvent] = useState('')
  const [expanded, setExpanded] = useState(null)

  const query = useList('admin.audit-logs', '/admin/audit-logs', {
    page,
    event: event || undefined,
  })

  const logs = query.data?.data ?? []

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        {heading ?? (
          <p className="text-sm text-ink-500">
            Append-only. Records only what changed, and never a password.
          </p>
        )}

        <Select
          value={event}
          onChange={(newEvent) => {
            setEvent(newEvent.target.value)
            setPage(1)
          }}
          aria-label="Filter by event"
          className="w-48"
        >
          {EVENTS.map((value) => (
            <option key={value} value={value}>
              {value === '' ? 'All events' : value.replace(/_/g, ' ')}
            </option>
          ))}
        </Select>
      </div>

      {query.isError && <ErrorState error={query.error} onRetry={query.refetch} />}

      {query.isLoading ? (
        <div className="grid place-items-center py-16">
          <Spinner />
        </div>
      ) : logs.length === 0 ? (
        <EmptyState icon={ScrollText} title="Nothing logged yet" />
      ) : (
        <>
          <TableWrap>
            <thead>
              <tr>
                <Th>When</Th>
                <Th>Event</Th>
                <Th>Record</Th>
                <Th>By</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id} className="hover:bg-ink-50">
                  <Td className="text-ink-600">{dateTime(log.created_at)}</Td>
                  <Td>
                    <Badge tone={EVENT_TONE[log.event] ?? 'neutral'}>{log.event_label}</Badge>
                  </Td>
                  <Td className="text-ink-800">
                    {log.auditable_type} #{log.auditable_id}
                  </Td>
                  <Td className="text-ink-600">
                    {/* A scheduled job has no actor; that stays blank rather
                        than being attributed to somebody. */}
                    {log.user?.name ?? <span className="text-ink-400">System</span>}
                  </Td>
                  <Td className="text-right">
                    {(log.old_values || log.new_values) && (
                      <button
                        type="button"
                        onClick={() => setExpanded(expanded === log.id ? null : log.id)}
                        className="text-sm font-medium text-brand-800 hover:underline"
                      >
                        {expanded === log.id ? 'Hide' : 'Changes'}
                      </button>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>

          {expanded && (
            <div className="rounded-card border border-ink-200 bg-white p-4">
              <p className="mb-2 text-sm font-medium text-ink-800">Changed values</p>
              <pre className="scroll-x rounded-lg bg-ink-900 p-3 text-xs text-ink-100">
                {JSON.stringify(
                  {
                    from: logs.find((log) => log.id === expanded)?.old_values,
                    to: logs.find((log) => log.id === expanded)?.new_values,
                  },
                  null,
                  2,
                )}
              </pre>
            </div>
          )}

          <Pagination meta={query.data?.meta} onPage={setPage} />
        </>
      )}
    </div>
  )
}

export default function AuditLogPage() {
  return (
    <AuditLog
      heading={
        <div>
          <h1 className="text-xl font-semibold text-ink-900">Audit log</h1>
          <p className="mt-0.5 text-sm text-ink-500">
            Append-only. Records only what changed, and never a password.
          </p>
        </div>
      }
    />
  )
}
