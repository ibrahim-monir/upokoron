import { ExternalLink, RefreshCw } from 'lucide-react'

import { useRecord, useWrite } from './useResource'
import { Badge, Button, Card, ErrorState, Spinner } from '../../components/ui'

export default function SitemapPage() {
  const query = useRecord('admin.sitemap', '/admin/sitemap')
  const write = useWrite('admin.sitemap')

  if (query.isLoading) {
    return (
      <div className="grid place-items-center py-12">
        <Spinner />
      </div>
    )
  }

  if (query.isError) return <ErrorState error={query.error} onRetry={query.refetch} />

  const data = query.data.data

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink-900">Sitemap</h1>
          <p className="mt-0.5 max-w-2xl text-sm text-ink-500">
            Submitted to Search Console at{' '}
            <a
              href={data.index_url}
              target="_blank"
              rel="noreferrer"
              className="font-medium text-brand-700 underline"
            >
              {data.index_url}
            </a>
            . Split by type into batches of {data.batch_size} URLs each, and rebuilt from the
            catalogue automatically once an hour.
          </p>
        </div>

        <Button
          variant="secondary"
          onClick={() => write.mutate({ url: '/admin/sitemap/regenerate' })}
          loading={write.isPending}
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          Regenerate now
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {data.segments.map((segment) => (
          <Card key={segment.key} className="p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="font-semibold text-ink-900">{segment.label}</p>
              <Badge tone="neutral">
                {segment.url_count} URL{segment.url_count === 1 ? '' : 's'}
              </Badge>
            </div>

            {segment.batches.length === 0 ? (
              <p className="mt-2 text-sm text-ink-500">Nothing to list yet.</p>
            ) : (
              <ul className="mt-2 flex flex-col gap-1">
                {segment.batches.map((url) => (
                  <li key={url}>
                    <a
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 text-sm text-brand-700 underline"
                    >
                      {url.split('/').pop()}
                      <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        ))}
      </div>
    </div>
  )
}
