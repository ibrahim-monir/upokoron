import { useState } from 'react'
import { CheckCircle2, Search, Star, Trash2, XCircle } from 'lucide-react'
import { cx } from '../../lib/format'
import { useAuthStore } from '../../stores/authStore'
import {
  Badge,
  EmptyState,
  ErrorState,
  Input,
  Pagination,
  Select,
  Spinner,
  TableWrap,
  Td,
  Th,
} from '../../components/ui'
import { useList, useWrite } from './useResource'

const STATUSES = [
  { value: '', label: 'All statuses' },
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
]

const STATUS_TONE = { pending: 'warning', approved: 'success', rejected: 'danger' }

function Stars({ rating }) {
  return (
    <div className="flex">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={cx('h-3.5 w-3.5', i < rating ? 'fill-amber-400 text-amber-400' : 'text-ink-300')}
          aria-hidden="true"
        />
      ))}
    </div>
  )
}

export default function ReviewsPage() {
  const can = useAuthStore((state) => state.can)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)

  const query = useList('admin-reviews', '/admin/reviews', {
    search: search || undefined,
    status: status || undefined,
    page,
  })

  const setStatusWrite = useWrite('admin-reviews')
  const deleteWrite = useWrite('admin-reviews', { successMessage: 'Review removed.' })

  const rows = query.data?.data ?? []
  const summary = query.data?.summary?.by_status ?? {}
  const canModerate = can('reviews.moderate')

  const approve = (review) =>
    setStatusWrite.mutate({ method: 'put', url: `/admin/reviews/${review.id}/status`, body: { status: 'approved' } })

  const reject = (review) =>
    setStatusWrite.mutate({ method: 'put', url: `/admin/reviews/${review.id}/status`, body: { status: 'rejected' } })

  const destroy = (review) => {
    if (!window.confirm('Delete this review permanently?')) return
    deleteWrite.mutate({ method: 'delete', url: `/admin/reviews/${review.id}` })
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold text-ink-900">Reviews</h1>
        <p className="mt-1 text-sm text-ink-500">
          Approve, reject or remove customer reviews before they reach the storefront.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {STATUSES.slice(1).map(({ value, label }) => (
          <button
            key={value}
            type="button"
            onClick={() => {
              setStatus(status === value ? '' : value)
              setPage(1)
            }}
            className={cx(
              'rounded-card border p-4 text-left shadow-card transition-colors',
              status === value ? 'border-brand-500 bg-brand-50' : 'border-ink-200 bg-white hover:border-ink-300',
            )}
          >
            <p className="text-xs font-medium uppercase tracking-wide text-ink-500">{label}</p>
            <p className="mt-1 text-2xl font-bold tabular text-ink-900">{summary[value]?.count ?? 0}</p>
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
            placeholder="Search product, customer or review text..."
            aria-label="Search reviews"
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
          icon={Star}
          title="No reviews"
          description="Customer reviews will appear here once submitted."
        />
      ) : (
        <TableWrap>
          <thead>
            <tr>
              <Th>Product</Th>
              <Th>Customer</Th>
              <Th>Rating</Th>
              <Th>Review</Th>
              <Th>Status</Th>
              <Th>Actions</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((review) => (
              <tr key={review.id}>
                <Td>{review.product?.name ?? '—'}</Td>
                <Td>
                  <p className="font-medium text-ink-800">{review.customer?.name ?? '—'}</p>
                  <p className="text-xs text-ink-400">{review.customer?.phone}</p>
                </Td>
                <Td>
                  <Stars rating={review.rating} />
                </Td>
                <Td className="max-w-sm">
                  {review.title && <p className="font-medium text-ink-900">{review.title}</p>}
                  <p className="line-clamp-2 text-ink-600">{review.comment}</p>
                  {review.is_verified_purchase && (
                    <Badge tone="success" className="mt-1">Verified Purchase</Badge>
                  )}
                </Td>
                <Td>
                  <Badge tone={STATUS_TONE[review.status]}>{review.status_label}</Badge>
                </Td>
                <Td>
                  <div className="flex gap-2">
                    {canModerate && review.status !== 'approved' && (
                      <button
                        type="button"
                        onClick={() => approve(review)}
                        title="Approve"
                        className="rounded-lg p-1.5 text-success-700 hover:bg-success-50"
                      >
                        <CheckCircle2 className="h-4 w-4" />
                      </button>
                    )}
                    {canModerate && review.status !== 'rejected' && (
                      <button
                        type="button"
                        onClick={() => reject(review)}
                        title="Reject"
                        className="rounded-lg p-1.5 text-warning-700 hover:bg-warning-50"
                      >
                        <XCircle className="h-4 w-4" />
                      </button>
                    )}
                    {canModerate && (
                      <button
                        type="button"
                        onClick={() => destroy(review)}
                        title="Delete"
                        className="rounded-lg p-1.5 text-danger-700 hover:bg-danger-50"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}

      <Pagination meta={query.data?.meta} onPage={setPage} />
    </div>
  )
}
