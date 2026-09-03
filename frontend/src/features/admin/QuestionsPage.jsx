import { useState } from 'react'
import { CheckCircle2, MessagesSquare, Search, Send, Trash2, XCircle } from 'lucide-react'
import { cx } from '../../lib/format'
import { useAuthStore } from '../../stores/authStore'
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  Input,
  Pagination,
  Select,
  Spinner,
  Textarea,
} from '../../components/ui'
import { useList, useWrite } from './useResource'

const STATUSES = [
  { value: '', label: 'All statuses' },
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
]

const STATUS_TONE = { pending: 'warning', approved: 'success', rejected: 'danger' }

/**
 * One question, with the reply box under it.
 *
 * The answer is edited in place rather than behind a modal: the job is
 * reading a question and typing a reply to it, and a dialog that covers the
 * question while you answer it makes that harder, not easier.
 */
function QuestionCard({ question, canAnswer, onAnswer, onStatus, onDelete, saving }) {
  const [draft, setDraft] = useState(question.answer ?? '')
  const [open, setOpen] = useState(false)
  const isAnswered = Boolean(question.answer)

  return (
    <article className="flex flex-col gap-3 rounded-card border border-ink-200 bg-white p-4 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium text-ink-900">{question.question}</p>
          <p className="mt-1 text-xs text-ink-500">
            {question.asker_name}
            {question.asker_email ? ` · ${question.asker_email}` : ''}
            {question.created_at ? ` · ${new Date(question.created_at).toLocaleDateString()}` : ''}
          </p>
          <p className="mt-0.5 text-xs text-ink-400">on {question.product?.name ?? 'a deleted product'}</p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Badge tone={STATUS_TONE[question.status]}>{question.status_label}</Badge>
          {!isAnswered && <Badge tone="warning">Unanswered</Badge>}
        </div>
      </div>

      {isAnswered && !open && (
        <div className="rounded-card bg-ink-50 p-3">
          <p className="whitespace-pre-line text-sm text-ink-700">{question.answer}</p>
          <p className="mt-1 text-xs text-ink-400">
            {question.answered_by ? `Answered by ${question.answered_by}` : 'Answered'}
            {question.answered_at ? ` · ${new Date(question.answered_at).toLocaleDateString()}` : ''}
          </p>
        </div>
      )}

      {canAnswer && (open || !isAnswered) && (
        <div className="flex flex-col gap-2">
          <Textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Answer this shopper. Your reply shows on the product page."
            aria-label="Answer"
            rows={3}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={() => onAnswer(question, draft)}
              loading={saving}
              disabled={draft.trim().length === 0}
            >
              <Send className="h-4 w-4" aria-hidden="true" />
              {isAnswered ? 'Update answer' : 'Answer and publish'}
            </Button>
            {open && (
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setDraft(question.answer ?? '')
                  setOpen(false)
                }}
              >
                Cancel
              </Button>
            )}
          </div>
        </div>
      )}

      {canAnswer && (
        <div className="flex flex-wrap gap-3 border-t border-ink-100 pt-3 text-xs">
          {isAnswered && !open && (
            <button type="button" onClick={() => setOpen(true)} className="font-medium text-brand-700 hover:underline">
              Edit answer
            </button>
          )}
          {question.status !== 'approved' && (
            <button
              type="button"
              onClick={() => onStatus(question, 'approved')}
              className="inline-flex items-center gap-1 font-medium text-success-700 hover:underline"
            >
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
              Publish without answering
            </button>
          )}
          {question.status !== 'rejected' && (
            <button
              type="button"
              onClick={() => onStatus(question, 'rejected')}
              className="inline-flex items-center gap-1 font-medium text-warning-700 hover:underline"
            >
              <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
              Hide
            </button>
          )}
          <button
            type="button"
            onClick={() => onDelete(question)}
            className="inline-flex items-center gap-1 font-medium text-danger-700 hover:underline"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            Delete
          </button>
        </div>
      )}
    </article>
  )
}

export default function QuestionsPage() {
  const can = useAuthStore((state) => state.can)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [unanswered, setUnanswered] = useState(false)
  const [page, setPage] = useState(1)

  const query = useList('admin-questions', '/admin/questions', {
    search: search || undefined,
    status: status || undefined,
    unanswered: unanswered ? 1 : undefined,
    page,
  })

  const answerWrite = useWrite('admin-questions')
  const statusWrite = useWrite('admin-questions')
  const deleteWrite = useWrite('admin-questions', { successMessage: 'Question removed.' })

  const rows = query.data?.data ?? []
  const summary = query.data?.summary ?? {}
  const byStatus = summary.by_status ?? {}
  const canAnswer = can('questions.answer')

  const answer = (question, text) =>
    answerWrite.mutate({ method: 'put', url: `/admin/questions/${question.id}/answer`, body: { answer: text } })

  const setQuestionStatus = (question, next) =>
    statusWrite.mutate({ method: 'put', url: `/admin/questions/${question.id}/status`, body: { status: next } })

  const destroy = (question) => {
    if (!window.confirm('Delete this question permanently?')) return
    deleteWrite.mutate({ method: 'delete', url: `/admin/questions/${question.id}` })
  }

  // The tiles double as filters, and clicking the active one clears it.
  const toggleStatus = (value) => {
    setStatus(status === value ? '' : value)
    setUnanswered(false)
    setPage(1)
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold text-ink-900">Product Questions</h1>
        <p className="mt-1 text-sm text-ink-500">
          Anyone can ask about a product without an account, so nothing reaches the storefront until you
          answer it or publish it here.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <button
          type="button"
          onClick={() => {
            setUnanswered(!unanswered)
            setStatus('')
            setPage(1)
          }}
          className={cx(
            'rounded-card border p-4 text-left shadow-card transition-colors',
            unanswered ? 'border-brand-500 bg-brand-50' : 'border-ink-200 bg-white hover:border-ink-300',
          )}
        >
          <p className="text-xs font-medium uppercase tracking-wide text-ink-500">Needs an answer</p>
          <p className="mt-1 text-2xl font-bold tabular text-ink-900">{summary.unanswered ?? 0}</p>
        </button>

        {STATUSES.slice(1).map(({ value, label }) => (
          <button
            key={value}
            type="button"
            onClick={() => toggleStatus(value)}
            className={cx(
              'rounded-card border p-4 text-left shadow-card transition-colors',
              status === value ? 'border-brand-500 bg-brand-50' : 'border-ink-200 bg-white hover:border-ink-300',
            )}
          >
            <p className="text-xs font-medium uppercase tracking-wide text-ink-500">{label}</p>
            <p className="mt-1 text-2xl font-bold tabular text-ink-900">{byStatus[value]?.count ?? 0}</p>
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400"
            aria-hidden="true"
          />
          <Input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value)
              setPage(1)
            }}
            placeholder="Search product, asker or question text..."
            aria-label="Search questions"
            className="pl-9"
          />
        </div>

        <Select
          value={status}
          onChange={(event) => {
            setStatus(event.target.value)
            setPage(1)
          }}
          aria-label="Filter by status"
          className="sm:w-48"
        >
          {STATUSES.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </div>

      {query.isError ? (
        <ErrorState error={query.error} onRetry={query.refetch} />
      ) : query.isLoading ? (
        <div className="grid place-items-center py-16">
          <Spinner />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={MessagesSquare}
          title="No questions"
          description="Questions shoppers ask on a product page will appear here."
        />
      ) : (
        <div className="flex flex-col gap-3">
          {rows.map((question) => (
            <QuestionCard
              // Keyed on the answer too, so the reply box resets to whatever
              // was just saved rather than holding a stale draft.
              key={`${question.id}:${question.answered_at ?? ''}`}
              question={question}
              canAnswer={canAnswer}
              onAnswer={answer}
              onStatus={setQuestionStatus}
              onDelete={destroy}
              saving={answerWrite.isPending}
            />
          ))}
        </div>
      )}

      <Pagination meta={query.data?.meta} onPage={setPage} />
    </div>
  )
}
