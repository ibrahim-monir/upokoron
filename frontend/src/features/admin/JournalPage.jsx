import { Fragment, useState } from 'react'
import { ScrollText } from 'lucide-react'
import { useList, useWrite } from './useResource'
import { useQuery } from '@tanstack/react-query'
import { get } from '../../lib/api'
import { cx, date, money } from '../../lib/format'
import { useAuthStore } from '../../stores/authStore'
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  Field,
  Pagination,
  Select,
  Spinner,
  TableWrap,
  Td,
  Th,
} from '../../components/ui'

const STATUS_TONE = { posted: 'success', reversed: 'warning', reversal: 'neutral' }

function ManualEntryForm({ onDone }) {
  const write = useWrite('admin.journal', { onSuccess: onDone })
  const [lines, setLines] = useState([
    { account_id: '', type: 'debit', amount: '' },
    { account_id: '', type: 'credit', amount: '' },
  ])

  const accounts = useQuery({
    queryKey: ['admin', 'accounts', 'postable'],
    queryFn: () => get('/admin/accounts', { params: { postable_only: 1 } }),
  })

  const setLine = (index, patch) =>
    setLines((current) => current.map((line, i) => (i === index ? { ...line, ...patch } : line)))

  const debits = lines
    .filter((line) => line.type === 'debit')
    .reduce((sum, line) => sum + Number(line.amount || 0), 0)

  const credits = lines
    .filter((line) => line.type === 'credit')
    .reduce((sum, line) => sum + Number(line.amount || 0), 0)

  const balanced = debits > 0 && Math.abs(debits - credits) < 0.005

  const submit = (event) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)

    write.mutate({
      url: '/admin/journal-entries',
      body: {
        entry_date: data.get('entry_date') || null,
        memo: data.get('memo') || null,
        lines: lines
          .filter((line) => line.account_id && Number(line.amount) > 0)
          .map((line) => ({
            account_id: Number(line.account_id),
            type: line.type,
            amount: line.amount,
          })),
      },
    })
  }

  return (
    <Card>
      <CardHeader
        title="Manual journal entry"
        description="For adjustments with no document behind them. Debits must equal credits."
      />

      <form onSubmit={submit} className="flex flex-col gap-4 p-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Date" name="entry_date" type="date" />
          <Field label="Memo" name="memo" placeholder="What is this for?" />
        </div>

        <div className="flex flex-col gap-2">
          {lines.map((line, index) => (
            <div key={index} className="grid gap-2 sm:grid-cols-[1fr_120px_140px_40px]">
              <Select
                value={line.account_id}
                onChange={(event) => setLine(index, { account_id: event.target.value })}
                aria-label={`Account for line ${index + 1}`}
              >
                <option value="">Choose an account</option>
                {(accounts.data?.data ?? []).map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.code} — {account.name}
                  </option>
                ))}
              </Select>

              <Select
                value={line.type}
                onChange={(event) => setLine(index, { type: event.target.value })}
                aria-label={`Side for line ${index + 1}`}
              >
                <option value="debit">Debit</option>
                <option value="credit">Credit</option>
              </Select>

              <input
                type="number"
                step="0.01"
                min="0"
                value={line.amount}
                onChange={(event) => setLine(index, { amount: event.target.value })}
                placeholder="0.00"
                aria-label={`Amount for line ${index + 1}`}
                className="tabular h-10 rounded-lg border border-ink-300 px-3 text-right text-sm"
              />

              <button
                type="button"
                onClick={() => setLines(lines.filter((_, i) => i !== index))}
                disabled={lines.length <= 2}
                aria-label={`Remove line ${index + 1}`}
                className="rounded-lg text-ink-500 hover:bg-ink-100 disabled:opacity-30"
              >
                ×
              </button>
            </div>
          ))}

          <button
            type="button"
            onClick={() => setLines([...lines, { account_id: '', type: 'debit', amount: '' }])}
            className="w-fit text-sm font-medium text-brand-700 hover:underline"
          >
            + Add line
          </button>
        </div>

        <div
          className={cx(
            'flex items-center justify-between rounded-lg px-3 py-2 text-sm',
            balanced ? 'bg-success-50 text-success-700' : 'bg-warning-50 text-warning-700',
          )}
        >
          <span>{balanced ? 'Balanced' : 'Debits and credits must match'}</span>
          <span className="tabular">
            {money(debits)} / {money(credits)}
          </span>
        </div>

        <div className="flex gap-2">
          <Button type="submit" loading={write.isPending} disabled={!balanced}>
            Post entry
          </Button>
          <Button variant="secondary" onClick={onDone}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  )
}

export default function JournalPage() {
  const can = useAuthStore((state) => state.can)
  const [page, setPage] = useState(1)
  const [creating, setCreating] = useState(false)
  const [expanded, setExpanded] = useState(null)

  const query = useList('admin.journal', '/admin/journal-entries', { page })
  const reverse = useWrite('admin.journal')

  const entries = query.data?.data ?? []

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink-900">Journal</h1>
          <p className="mt-0.5 text-sm text-ink-500">
            Posted entries are immutable. A correction is a reversing entry, and both stay visible.
          </p>
        </div>

        {can('accounting.post') && !creating && (
          <Button onClick={() => setCreating(true)}>New manual entry</Button>
        )}
      </div>

      {creating && <ManualEntryForm onDone={() => setCreating(false)} />}

      {query.isError && <ErrorState error={query.error} onRetry={query.refetch} />}

      {query.isLoading ? (
        <div className="grid place-items-center py-16">
          <Spinner />
        </div>
      ) : entries.length === 0 ? (
        <EmptyState icon={ScrollText} title="Nothing posted yet" />
      ) : (
        <>
          <TableWrap>
            <thead>
              <tr>
                <Th>Number</Th>
                <Th>Date</Th>
                <Th>Event</Th>
                <Th>Memo</Th>
                <Th numeric>Amount</Th>
                <Th>Status</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                // A shorthand fragment cannot carry a key, and each entry
                // renders two sibling rows.
                <Fragment key={entry.id}>
                  <tr className="hover:bg-ink-50">
                    <Td className="tabular font-medium text-ink-900">{entry.number}</Td>
                    <Td>{date(entry.entry_date)}</Td>
                    <Td className="text-ink-600">{entry.event}</Td>
                    <Td className="max-w-xs truncate text-ink-600">{entry.memo ?? '—'}</Td>
                    <Td numeric className="font-medium">{money(entry.total_debit)}</Td>
                    <Td>
                      <Badge tone={STATUS_TONE[entry.status] ?? 'neutral'}>{entry.status_label}</Badge>
                    </Td>
                    <Td className="text-right">
                      <div className="flex justify-end gap-3">
                        <button
                          type="button"
                          onClick={() => setExpanded(expanded === entry.id ? null : entry.id)}
                          className="text-sm font-medium text-brand-700 hover:underline"
                        >
                          {expanded === entry.id ? 'Hide' : 'Lines'}
                        </button>

                        {can('accounting.reverse') && entry.status === 'posted' && (
                          <button
                            type="button"
                            onClick={() => {
                              const reason = window.prompt(`Why is ${entry.number} being reversed?`)
                              if (reason) {
                                reverse.mutate({
                                  url: `/admin/journal-entries/${entry.id}/reverse`,
                                  body: { reason },
                                })
                              }
                            }}
                            className="text-sm font-medium text-danger-700 hover:underline"
                          >
                            Reverse
                          </button>
                        )}
                      </div>
                    </Td>
                  </tr>

                  {expanded === entry.id && (
                    <tr>
                      <Td colSpan={7} className="bg-ink-50 p-0">
                        <table className="w-full text-sm">
                          <thead>
                            <tr>
                              <Th>Account</Th>
                              <Th numeric>Debit</Th>
                              <Th numeric>Credit</Th>
                              <Th>Memo</Th>
                            </tr>
                          </thead>
                          <tbody>
                            {(entry.lines ?? []).map((line) => (
                              <tr key={line.line_no}>
                                <Td>
                                  <span className="tabular text-ink-500">{line.account_code}</span>{' '}
                                  {line.account_name}
                                </Td>
                                <Td numeric>{Number(line.debit) ? money(line.debit) : '—'}</Td>
                                <Td numeric>{Number(line.credit) ? money(line.credit) : '—'}</Td>
                                <Td className="text-ink-500">{line.memo ?? '—'}</Td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </Td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </TableWrap>

          <Pagination meta={query.data?.meta} onPage={setPage} />
        </>
      )}
    </div>
  )
}
