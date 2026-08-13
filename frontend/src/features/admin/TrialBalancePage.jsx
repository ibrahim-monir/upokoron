import { useState } from 'react'
import { CheckCircle2, XCircle } from 'lucide-react'
import { useList } from './useResource'
import { money } from '../../lib/format'
import { Badge, Card, ErrorState, Field, Spinner, TableWrap, Td, Th } from '../../components/ui'

export default function TrialBalancePage() {
  const [asOf, setAsOf] = useState('')

  const query = useList('admin.trial-balance', '/admin/reports/trial-balance', {
    as_of: asOf || undefined,
  })

  const report = query.data

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink-900">Trial balance</h1>
          <p className="mt-0.5 text-sm text-ink-500">
            Total debits must equal total credits. If they ever do not, something wrote to the ledger
            outside the journal service.
          </p>
        </div>

        <Field
          label="As of"
          type="date"
          value={asOf}
          onChange={(event) => setAsOf(event.target.value)}
          className="w-44"
        />
      </div>

      {query.isError && <ErrorState error={query.error} onRetry={query.refetch} />}

      {query.isLoading ? (
        <div className="grid place-items-center py-16">
          <Spinner />
        </div>
      ) : (
        <>
          <Card className="flex flex-wrap items-center justify-between gap-4 p-4">
            <div className="flex items-center gap-2">
              {report?.balanced ? (
                <>
                  <CheckCircle2 className="h-5 w-5 text-success-700" aria-hidden="true" />
                  <span className="font-medium text-success-700">Balanced</span>
                </>
              ) : (
                <>
                  <XCircle className="h-5 w-5 text-danger-700" aria-hidden="true" />
                  <span className="font-medium text-danger-700">Out of balance</span>
                </>
              )}
              <span className="text-sm text-ink-500">as of {report?.as_of}</span>
            </div>

            <dl className="flex gap-6 text-sm">
              <div>
                <dt className="text-ink-500">Total debits</dt>
                <dd className="tabular text-lg font-semibold text-ink-900">
                  {money(report?.total_debit ?? 0)}
                </dd>
              </div>
              <div>
                <dt className="text-ink-500">Total credits</dt>
                <dd className="tabular text-lg font-semibold text-ink-900">
                  {money(report?.total_credit ?? 0)}
                </dd>
              </div>
            </dl>
          </Card>

          <TableWrap>
            <thead>
              <tr>
                <Th>Code</Th>
                <Th>Account</Th>
                <Th>Category</Th>
                <Th numeric>Debit</Th>
                <Th numeric>Credit</Th>
              </tr>
            </thead>
            <tbody>
              {(report?.rows ?? []).map((row) => (
                <tr key={row.account_id} className="hover:bg-ink-50">
                  <Td className="tabular text-ink-500">{row.code}</Td>
                  <Td className="text-ink-900">{row.name}</Td>
                  <Td>
                    <Badge tone="neutral">{row.category_label}</Badge>
                  </Td>
                  <Td numeric>{Number(row.debit) ? money(row.debit) : '—'}</Td>
                  <Td numeric>{Number(row.credit) ? money(row.credit) : '—'}</Td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-ink-50 font-semibold">
                <Td colSpan={3} className="text-ink-900">
                  Total
                </Td>
                <Td numeric>{money(report?.total_debit ?? 0)}</Td>
                <Td numeric>{money(report?.total_credit ?? 0)}</Td>
              </tr>
            </tfoot>
          </TableWrap>

          {(report?.rows ?? []).length === 0 && (
            <p className="py-10 text-center text-sm text-ink-500">
              Nothing has been posted to the ledger yet.
            </p>
          )}
        </>
      )}
    </div>
  )
}
