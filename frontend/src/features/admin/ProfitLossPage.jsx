import { useState } from 'react'
import { useList } from './useResource'
import { cx, money } from '../../lib/format'
import { Card, CardHeader, ErrorState, Field, Spinner, Td, Th } from '../../components/ui'

function Section({ title, rows, total, tone }) {
  return (
    <Card>
      <CardHeader title={title} />

      {rows.length === 0 ? (
        <p className="px-4 py-6 text-sm text-ink-500">Nothing recorded.</p>
      ) : (
        <table className="w-full text-sm">
          <tbody>
            {rows.map((row) => (
              <tr key={row.code}>
                <Td className="text-ink-500">{row.code}</Td>
                <Td className="text-ink-800">{row.name}</Td>
                <Td numeric>{money(row.amount)}</Td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-ink-50">
              <Td colSpan={2} className="font-semibold text-ink-900">
                Total
              </Td>
              <Td numeric className={cx('font-semibold', tone)}>
                {money(total)}
              </Td>
            </tr>
          </tfoot>
        </table>
      )}
    </Card>
  )
}

export default function ProfitLossPage() {
  const [range, setRange] = useState({ from: '', to: '' })

  const query = useList('admin.profit-loss', '/admin/reports/profit-loss', {
    from: range.from || undefined,
    to: range.to || undefined,
  })

  const report = query.data

  const headline = [
    { label: 'Net sales', value: report?.net_sales },
    { label: 'Cost of goods sold', value: report?.cost_of_goods_sold },
    { label: 'Gross profit', value: report?.gross_profit, emphasis: true },
    { label: 'Operating expenses', value: report?.operating_expenses },
    { label: 'Net profit', value: report?.net_profit, emphasis: true },
  ]

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink-900">Profit and loss</h1>
          <p className="mt-0.5 text-sm text-ink-500">
            Derived from the same ledger as the trial balance, so the two cannot disagree.
          </p>
        </div>

        <div className="flex gap-2">
          <Field
            label="From"
            type="date"
            value={range.from}
            onChange={(event) => setRange({ ...range, from: event.target.value })}
            className="w-40"
          />
          <Field
            label="To"
            type="date"
            value={range.to}
            onChange={(event) => setRange({ ...range, to: event.target.value })}
            className="w-40"
          />
        </div>
      </div>

      {query.isError && <ErrorState error={query.error} onRetry={query.refetch} />}

      {query.isLoading ? (
        <div className="grid place-items-center py-16">
          <Spinner />
        </div>
      ) : (
        <>
          <Card>
            <dl className="grid gap-px bg-ink-200 sm:grid-cols-5">
              {headline.map(({ label, value, emphasis }) => (
                <div key={label} className="bg-white p-4">
                  <dt className="text-xs font-medium uppercase tracking-wide text-ink-500">{label}</dt>
                  <dd
                    className={cx(
                      'tabular mt-1 text-xl font-semibold',
                      emphasis
                        ? Number(value) >= 0
                          ? 'text-success-700'
                          : 'text-danger-700'
                        : 'text-ink-900',
                    )}
                  >
                    {money(value ?? 0)}
                  </dd>
                </div>
              ))}
            </dl>

            <div className="flex gap-6 border-t border-ink-200 px-4 py-2.5 text-xs text-ink-500">
              <span>Gross margin {report?.gross_margin_percent ?? '0.00'}%</span>
              <span>Net margin {report?.net_margin_percent ?? '0.00'}%</span>
            </div>
          </Card>

          <div className="grid gap-4 lg:grid-cols-3">
            <Section
              title="Revenue"
              rows={report?.breakdown?.revenue ?? []}
              total={report?.net_sales ?? 0}
              tone="text-success-700"
            />
            <Section
              title="Cost of goods sold"
              rows={report?.breakdown?.cost_of_goods_sold ?? []}
              total={report?.cost_of_goods_sold ?? 0}
              tone="text-ink-900"
            />
            <Section
              title="Operating expenses"
              rows={report?.breakdown?.expenses ?? []}
              total={report?.operating_expenses ?? 0}
              tone="text-ink-900"
            />
          </div>
        </>
      )}
    </div>
  )
}
