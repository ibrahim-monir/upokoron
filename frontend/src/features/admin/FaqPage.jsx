import { useState } from 'react'
import { ArrowDown, ArrowUp, HelpCircle, Plus, Trash2 } from 'lucide-react'

import { cx } from '../../lib/format'
import { useList, useWrite } from './useResource'
import { Badge, Button, Card, EmptyState, ErrorState, Field, Spinner, Textarea } from '../../components/ui'

const empty = { question: '', answer: '', is_active: true }

/**
 * The questions answered on the contact page.
 *
 * Nothing is seeded, so this screen starts empty on purpose: an invented FAQ
 * answers questions nobody asked, and the storefront draws no section until
 * there is something real in here.
 */
export default function FaqPage() {
  const query = useList('admin.faqs', '/admin/faqs')
  const write = useWrite('admin.faqs')

  const [form, setForm] = useState({ ...empty })

  const faqs = query.data?.data ?? []
  const editing = Boolean(form.id)

  const submit = (event) => {
    event.preventDefault()

    write.mutate(
      editing
        ? { method: 'put', url: `/admin/faqs/${form.id}`, body: form }
        : { url: '/admin/faqs', body: form },
      { onSuccess: () => setForm({ ...empty }) },
    )
  }

  const remove = (faq) => {
    if (!window.confirm(`Delete “${faq.question}”?`)) return

    write.mutate({ method: 'delete', url: `/admin/faqs/${faq.id}` })
  }

  /*
   * Moving one question rewrites the whole running order in a single
   * request, so the list cannot be left half-reordered by a failure.
   */
  const move = (index, direction) => {
    const next = [...faqs]
    const target = index + direction

    if (target < 0 || target >= next.length) return

    ;[next[index], next[target]] = [next[target], next[index]]

    write.mutate({
      method: 'put',
      url: '/admin/faqs/reorder',
      body: { order: next.map((faq) => faq.id) },
    })
  }

  if (query.isError) return <ErrorState error={query.error} onRetry={query.refetch} />

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-ink-900">Frequently asked questions</h1>
        <p className="mt-0.5 text-sm text-ink-500">
          Shown on the contact page, in this order. The section is hidden entirely while this list
          is empty.
        </p>
      </div>

      <Card className="p-4">
        <form onSubmit={submit} className="flex flex-col gap-4">
          <Field label="Question">
            {({ id }) => (
              <input
                id={id}
                value={form.question}
                onChange={(event) => setForm({ ...form, question: event.target.value })}
                required
                maxLength={300}
                placeholder="Do you deliver outside Dhaka?"
                className="h-11 w-full rounded-lg border border-ink-200 px-3 text-sm"
              />
            )}
          </Field>

          <Field label="Answer">
            {({ id }) => (
              <Textarea
                id={id}
                rows={4}
                value={form.answer}
                onChange={(event) => setForm({ ...form, answer: event.target.value })}
                required
                maxLength={5000}
                placeholder="Yes — inside Dhaka in 1–2 days, and 3–5 days elsewhere."
              />
            )}
          </Field>

          <label className="flex items-center gap-2 text-sm text-ink-700">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(event) => setForm({ ...form, is_active: event.target.checked })}
              className="h-4 w-4 rounded border-ink-300"
            />
            Show on the contact page
          </label>

          <div className="flex items-center gap-2">
            <Button type="submit" loading={write.isPending}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              {editing ? 'Save changes' : 'Add question'}
            </Button>

            {editing && (
              <Button variant="secondary" onClick={() => setForm({ ...empty })}>
                Cancel
              </Button>
            )}
          </div>
        </form>
      </Card>

      {query.isLoading ? (
        <div className="grid place-items-center py-12">
          <Spinner />
        </div>
      ) : faqs.length === 0 ? (
        <EmptyState
          icon={HelpCircle}
          title="No questions yet"
          description="Add the ones customers actually ask. Until then the contact page shows no FAQ section."
        />
      ) : (
        <div className="flex flex-col gap-3">
          {faqs.map((faq, index) => (
            <Card key={faq.id} className={cx('p-4', !faq.is_active && 'opacity-60')}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-ink-900">{faq.question}</p>
                    {!faq.is_active && <Badge tone="neutral">Hidden</Badge>}
                  </div>

                  <p className="mt-1.5 whitespace-pre-line text-sm leading-6 text-ink-600">
                    {faq.answer}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                    aria-label="Move up"
                  >
                    <ArrowUp className="h-4 w-4" aria-hidden="true" />
                  </Button>

                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={index === faqs.length - 1}
                    onClick={() => move(index, 1)}
                    aria-label="Move down"
                  >
                    <ArrowDown className="h-4 w-4" aria-hidden="true" />
                  </Button>

                  <Button variant="secondary" size="sm" onClick={() => setForm(faq)}>
                    Edit
                  </Button>

                  <Button variant="ghost" size="icon" onClick={() => remove(faq)} aria-label="Delete">
                    <Trash2 className="h-4 w-4 text-danger-700" aria-hidden="true" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
