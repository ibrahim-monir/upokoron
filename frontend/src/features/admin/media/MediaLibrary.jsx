import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, ImageIcon, Search, Trash2, Upload, X } from 'lucide-react'
import { api, get } from '../../../lib/api'
import { cx, dateTime } from '../../../lib/format'
import { useAuthStore } from '../../../stores/authStore'
import {
  Button,
  EmptyState,
  ErrorState,
  Input,
  Pagination,
  Select,
  Spinner,
  useToast,
} from '../../../components/ui'

/**
 * The image library, shared by the standalone page and the picker modal.
 *
 * `onPick` turns it into a chooser: pass it and tiles become selectable,
 * omit it and it is a plain manager.
 */
export function MediaLibrary({ onPick, folder: fixedFolder, multiple = false, selected = [] }) {
  const can = useAuthStore((state) => state.can)
  const toast = useToast()
  const queryClient = useQueryClient()
  const fileInput = useRef(null)

  const [search, setSearch] = useState('')
  const [folder, setFolder] = useState(fixedFolder ?? '')
  const [page, setPage] = useState(1)
  const [dragging, setDragging] = useState(false)

  const query = useQuery({
    queryKey: ['admin', 'media', { search, folder, page }],
    queryFn: () =>
      get('/admin/media', {
        params: { search: search || undefined, folder: folder || undefined, page },
      }),
    placeholderData: (previous) => previous,
  })

  const upload = useMutation({
    mutationFn: async (files) => {
      const form = new FormData()

      Array.from(files).forEach((file) => form.append('files[]', file))
      form.append('folder', fixedFolder ?? folder ?? 'general')

      // Let the browser set the multipart boundary; naming it by hand is the
      // classic way to get an empty $request->file().
      const { data } = await api.post('/admin/media', form)

      return data
    },
    onSuccess(data) {
      queryClient.invalidateQueries({ queryKey: ['admin', 'media'] })
      toast.success(data.message)

      // Uploading inside a picker should hand the result straight back.
      if (onPick && data.data?.length === 1 && !multiple) onPick(data.data[0])
    },
    onError(error) {
      toast.error(error?.message ?? 'Upload failed.')
    },
  })

  const remove = useMutation({
    mutationFn: (id) => api.delete(`/admin/media/${id}`),
    onSuccess() {
      queryClient.invalidateQueries({ queryKey: ['admin', 'media'] })
      toast.success('Image deleted.')
    },
    onError(error) {
      // 409 lists exactly where the image is still used.
      toast.error(error?.message ?? 'Could not delete that image.')
    },
  })

  const items = query.data?.data ?? []
  const isSelected = (item) => selected.some((s) => (s?.id ?? s) === item.id)

  const handleFiles = (files) => {
    if (!files?.length) return

    if (!can('media.manage')) {
      toast.error('You do not have permission to upload images.')
      return
    }

    upload.mutate(files)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-48 flex-1">
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
            placeholder="Search by name or description"
            aria-label="Search images"
            className="pl-9"
          />
        </div>

        {!fixedFolder && (
          <Select
            value={folder}
            onChange={(event) => {
              setFolder(event.target.value)
              setPage(1)
            }}
            aria-label="Filter by folder"
            className="w-44"
          >
            <option value="">All folders</option>
            {(query.data?.folders ?? []).map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </Select>
        )}

        {can('media.manage') && (
          <Button onClick={() => fileInput.current?.click()} loading={upload.isPending}>
            <Upload className="h-4 w-4" aria-hidden="true" />
            Upload
          </Button>
        )}

        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(event) => {
            handleFiles(event.target.files)
            // Reset so re-picking the same file fires change again.
            event.target.value = ''
          }}
        />
      </div>

      <div
        onDragOver={(event) => {
          event.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault()
          setDragging(false)
          handleFiles(event.dataTransfer.files)
        }}
        className={cx(
          'rounded-card border-2 border-dashed p-3 transition-colors',
          dragging ? 'border-brand-500 bg-brand-50' : 'border-ink-200 bg-white',
        )}
      >
        {query.isError ? (
          <ErrorState error={query.error} onRetry={query.refetch} />
        ) : query.isLoading ? (
          <div className="grid place-items-center py-16">
            <Spinner />
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={ImageIcon}
            title={search ? 'Nothing matched' : 'No images yet'}
            description={
              can('media.manage')
                ? 'Drag images here, or use the Upload button. JPEG, PNG, WebP, GIF, or SVG up to 5 MB.'
                : 'Nothing has been uploaded yet.'
            }
          />
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
            {items.map((item) => (
              <li key={item.id} className="group relative">
                <button
                  type="button"
                  onClick={() => onPick?.(item)}
                  disabled={!onPick}
                  className={cx(
                    'block w-full overflow-hidden rounded-lg border-2 bg-ink-50 transition-colors',
                    isSelected(item)
                      ? 'border-brand-600'
                      : 'border-ink-200 enabled:hover:border-brand-400',
                    onPick ? 'cursor-pointer' : 'cursor-default',
                  )}
                >
                  <span className="block aspect-square">
                    <img
                      src={item.url}
                      alt={item.alt ?? item.original_name}
                      loading="lazy"
                      className="h-full w-full object-cover"
                    />
                  </span>
                </button>

                {isSelected(item) && (
                  <span className="pointer-events-none absolute left-2 top-2 grid h-6 w-6 place-items-center rounded-full bg-brand-600 text-white">
                    <Check className="h-3.5 w-3.5" aria-hidden="true" />
                  </span>
                )}

                {can('media.manage') && (
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm(`Delete “${item.original_name}”?`)) remove.mutate(item.id)
                    }}
                    aria-label={`Delete ${item.original_name}`}
                    className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full bg-white/90 text-danger-700 opacity-0 shadow-card transition-opacity hover:bg-white group-hover:opacity-100 focus-visible:opacity-100"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                )}

                <p className="mt-1 truncate text-xs text-ink-600" title={item.original_name}>
                  {item.original_name}
                </p>
                <p className="text-xs text-ink-400">
                  {item.width ? `${item.width}×${item.height} · ` : ''}
                  {item.size_label}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Pagination meta={query.data?.meta} onPage={setPage} />
    </div>
  )
}

/**
 * Modal wrapper. Used anywhere a form needs to choose an existing image.
 */
export function MediaPicker({ open, onClose, onSelect, folder, title = 'Choose an image' }) {
  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink-950/50 p-4"
    >
      <div className="mt-8 w-full max-w-5xl rounded-card bg-white shadow-raised">
        <div className="flex items-center justify-between border-b border-ink-200 p-4">
          <h2 className="text-base font-semibold text-ink-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1.5 text-ink-500 hover:bg-ink-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-4">
          <MediaLibrary
            folder={folder}
            onPick={(item) => {
              onSelect(item)
              onClose()
            }}
          />
        </div>
      </div>
    </div>
  )
}

export default function MediaPage() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-ink-900">Image library</h1>
        <p className="mt-0.5 text-sm text-ink-500">
          Upload once, use anywhere. Identical files are recognised and stored only once, and an
          image still in use cannot be deleted.
        </p>
      </div>

      <MediaLibrary />
    </div>
  )
}
