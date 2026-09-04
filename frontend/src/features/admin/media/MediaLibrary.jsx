import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Download, ImageIcon, LayoutGrid, List, Pencil, Search, Trash2, Upload, X } from 'lucide-react'
import { api, get } from '../../../lib/api'
import { cx } from '../../../lib/format'
import { useAuthStore } from '../../../stores/authStore'
import {
  Button,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Pagination,
  Select,
  Spinner,
  TableWrap,
  Td,
  Th,
  useToast,
} from '../../../components/ui'

const VIEW_KEY = 'upokoron.media.view'

/*
 * Grid or list, remembered.
 *
 * Which one someone wants is not a property of the page, it is a property of
 * the person: a shopkeeper picking a photograph wants thumbnails, and the
 * same person tidying alt text wants rows. Storing it means they choose once
 * rather than on every visit. localStorage throws outright in some privacy
 * modes, so both directions are wrapped and the grid is the fallback.
 */
function readView() {
  try {
    return localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'grid'
  } catch {
    return 'grid'
  }
}

function writeView(value) {
  try {
    localStorage.setItem(VIEW_KEY, value)
  } catch {
    // A preference that cannot be saved is not worth an error message.
  }
}

/** The name a person gave it, falling back to the one the file arrived with. */
function label(item) {
  return item.title || item.original_name
}

/**
 * The image library, shared by the standalone page and the picker modal.
 *
 * `onPick` turns it into a chooser: pass it and tiles become selectable,
 * omit it and it is a plain manager.
 */
/**
 * Saving the file itself, rather than the page's picture of it.
 *
 * A plain link with `download`: the file is served from this same origin, so
 * the browser writes it to disk instead of navigating to it, and it never
 * touches the API. The name it saves under is the one the file was uploaded
 * with -- the stored name is a UUID, which is meaningless in a downloads
 * folder.
 *
 * If a shop ever serves uploads from another host, `download` is ignored
 * cross-origin and the image opens in a tab instead. That is a degradation,
 * not a break: the picture is still one right-click from being saved.
 */
function downloadProps(item) {
  return { href: item.url, download: item.original_name, target: '_blank', rel: 'noreferrer' }
}

export function MediaLibrary({ onPick, folder: fixedFolder, multiple = false, selected = [] }) {
  const can = useAuthStore((state) => state.can)
  const toast = useToast()
  const queryClient = useQueryClient()
  const fileInput = useRef(null)

  const [search, setSearch] = useState('')
  const [folder, setFolder] = useState(fixedFolder ?? '')
  const [page, setPage] = useState(1)
  const [dragging, setDragging] = useState(false)
  const [view, setView] = useState(readView)
  const [editing, setEditing] = useState(null)

  const query = useQuery({
    queryKey: ['admin', 'media', { search, folder, page }],
    queryFn: () =>
      get('/admin/media', {
        params: { search: search || undefined, folder: folder || undefined, page },
      }),
    placeholderData: (previous) => previous,
  })

  const upload = useMutation({
    // Takes a real array of File objects, never a live FileList -- see
    // handleFiles for why that distinction matters.
    mutationFn: async (files) => {
      const form = new FormData()

      files.forEach((file) => form.append('files[]', file))
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

  const save = useMutation({
    mutationFn: ({ id, ...body }) => api.put(`/admin/media/${id}`, body),
    onSuccess() {
      queryClient.invalidateQueries({ queryKey: ['admin', 'media'] })
      toast.success('Image details saved.')
      setEditing(null)
    },
    onError(error) {
      toast.error(error?.message ?? 'Could not save those details.')
    },
  })

  const confirmDelete = (item) => {
    if (window.confirm(`Delete “${label(item)}”?`)) remove.mutate(item.id)
  }

  const items = query.data?.data ?? []
  const isSelected = (item) => selected.some((s) => (s?.id ?? s) === item.id)

  /**
   * Snapshot the FileList into a real array before anything else happens.
   *
   * `input.files` is LIVE: clearing `input.value` (which we do so that
   * re-picking the same file fires change again) empties it. Because
   * mutate() is asynchronous, the reset ran first and the upload built its
   * FormData from an already-empty list -- the request reached the server
   * carrying no file at all, and came back "The files field is required".
   */
  const handleFiles = (fileList) => {
    const files = Array.from(fileList ?? [])

    if (files.length === 0) return

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
            placeholder="Search by title, file name, or alt text"
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

        {/* Grid for choosing a picture, list for reading and fixing what is
            written about it. Same data, two jobs. */}
        <div className="flex rounded-lg border border-ink-300 bg-white p-0.5">
          {[
            { id: 'grid', icon: LayoutGrid, label: 'Grid view' },
            { id: 'list', icon: List, label: 'List view' },
          ].map(({ id, icon: Icon, label: viewLabel }) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                setView(id)
                writeView(id)
              }}
              aria-pressed={view === id}
              aria-label={viewLabel}
              title={viewLabel}
              className={cx(
                'grid h-9 w-9 place-items-center rounded-md transition-colors',
                view === id ? 'bg-brand-600 text-white' : 'text-ink-500 hover:bg-ink-100',
              )}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
            </button>
          ))}
        </div>

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
            // Copy the list out BEFORE resetting the input, which is what
            // makes re-picking the same file fire change again.
            const picked = Array.from(event.target.files ?? [])
            event.target.value = ''
            handleFiles(picked)
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
        ) : view === 'grid' ? (
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
                      alt={item.alt ?? label(item)}
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

                {/* Downloading is a read, so it is not behind media.manage --
                    anyone allowed to open the library may keep a copy. */}
                <div className="absolute right-2 top-2 flex gap-1 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
                  <a
                    {...downloadProps(item)}
                    aria-label={`Download ${label(item)}`}
                    className="grid h-7 w-7 place-items-center rounded-full bg-white/90 text-ink-700 shadow-card transition-colors hover:bg-white"
                  >
                    <Download className="h-3.5 w-3.5" aria-hidden="true" />
                  </a>

                  {can('media.manage') && (
                    <>
                    <button
                      type="button"
                      onClick={() => setEditing(item)}
                      aria-label={`Edit details of ${label(item)}`}
                      className="grid h-7 w-7 place-items-center rounded-full bg-white/90 text-ink-700 shadow-card transition-colors hover:bg-white"
                    >
                      <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>

                    <button
                      type="button"
                      onClick={() => confirmDelete(item)}
                      aria-label={`Delete ${label(item)}`}
                      className="grid h-7 w-7 place-items-center rounded-full bg-white/90 text-danger-700 shadow-card transition-colors hover:bg-white"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                    </>
                  )}
                </div>

                <p className="mt-1 truncate text-xs text-ink-600" title={label(item)}>
                  {label(item)}
                </p>
                <p className="text-xs text-ink-400">
                  {item.width ? `${item.width}×${item.height} · ` : ''}
                  {item.size_label}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <TableWrap>
            <thead>
              <tr>
                <Th className="w-16" />
                <Th>Name</Th>
                <Th>Alt text</Th>
                <Th>Folder</Th>
                <Th numeric>Size</Th>
                <Th>Uploaded</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className={cx('hover:bg-ink-50', isSelected(item) && 'bg-brand-50')}>
                  <Td>
                    <button
                      type="button"
                      onClick={() => onPick?.(item)}
                      disabled={!onPick}
                      aria-label={onPick ? `Choose ${label(item)}` : undefined}
                      className={cx(
                        'block h-12 w-12 overflow-hidden rounded-lg border-2 bg-ink-50',
                        isSelected(item) ? 'border-brand-600' : 'border-ink-200',
                        onPick ? 'cursor-pointer hover:border-brand-400' : 'cursor-default',
                      )}
                    >
                      <img
                        src={item.url}
                        alt={item.alt ?? label(item)}
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                    </button>
                  </Td>

                  <Td>
                    <p className="max-w-64 truncate font-medium text-ink-900">{label(item)}</p>
                    {/* The file's own name stays visible once a title is set:
                        it is how someone matches a row to the file they just
                        uploaded, and it is never editable. */}
                    {item.title && (
                      <p className="max-w-64 truncate text-xs text-ink-400">{item.original_name}</p>
                    )}
                  </Td>

                  <Td>
                    {item.alt ? (
                      <span className="line-clamp-2 max-w-64 text-ink-600">{item.alt}</span>
                    ) : (
                      <span className="text-ink-400">None</span>
                    )}
                  </Td>

                  <Td className="text-ink-600">{item.folder}</Td>

                  <Td numeric className="whitespace-nowrap text-ink-600">
                    {item.size_label}
                    {item.width && (
                      <span className="block text-xs text-ink-400">
                        {item.width}×{item.height}
                      </span>
                    )}
                  </Td>

                  <Td className="whitespace-nowrap text-ink-600">
                    {item.created_at ? new Date(item.created_at).toLocaleDateString() : ''}
                    {item.uploaded_by && (
                      <span className="block text-xs text-ink-400">{item.uploaded_by}</span>
                    )}
                  </Td>

                  <Td className="text-right">
                    <div className="flex justify-end gap-3">
                      <a {...downloadProps(item)} className="text-sm font-medium text-ink-700 hover:underline">
                        Download
                      </a>

                      {can('media.manage') && (
                        <>
                          <button
                            type="button"
                            onClick={() => setEditing(item)}
                            className="text-sm font-medium text-brand-800 hover:underline"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => confirmDelete(item)}
                            className="text-sm font-medium text-danger-700 hover:underline"
                          >
                            Delete
                          </button>
                        </>
                      )}
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </div>

      {editing && (
        <MediaDetailsDialog
          item={editing}
          folders={query.data?.folders ?? []}
          saving={save.isPending}
          onSave={(body) => save.mutate({ id: editing.id, ...body })}
          onClose={() => setEditing(null)}
        />
      )}

      <Pagination meta={query.data?.meta} onPage={setPage} />
    </div>
  )
}

/**
 * Edit what is written about one image.
 *
 * Three editable fields and a wall of read-only facts, because those are two
 * different things: the facts are what the file IS -- its size, its
 * dimensions, its address, who put it here -- and no form should imply they
 * can be typed over. The file itself is never replaced from this screen
 * either; a different picture is a different upload, or every product using
 * this one silently changes at once.
 */
function MediaDetailsDialog({ item, folders, saving, onSave, onClose }) {
  const toast = useToast()

  const [form, setForm] = useState({
    title: item.title ?? '',
    alt: item.alt ?? '',
    folder: item.folder ?? 'general',
  })

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') onClose()
    }

    document.addEventListener('keydown', onKey)

    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }))

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(item.url)
      toast.success('Address copied.')
    } catch {
      // Clipboard access is refused outside a secure context, and there is
      // nothing the person can do about that -- the address is on screen and
      // selectable either way.
      toast.error('Could not copy. Select the address and copy it by hand.')
    }
  }

  const facts = [
    ['File name', item.original_name],
    ['Type', item.mime],
    ['Size', item.size_label],
    ['Dimensions', item.width ? `${item.width} × ${item.height}` : 'Unknown'],
    ['Uploaded by', item.uploaded_by ?? 'Unknown'],
    ['Uploaded', item.created_at ? new Date(item.created_at).toLocaleString() : 'Unknown'],
  ]

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Image details"
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink-950/50 p-4"
    >
      <div className="mt-8 w-full max-w-3xl rounded-card bg-white shadow-raised">
        <div className="flex items-center justify-between border-b border-ink-200 p-4">
          <h2 className="text-base font-semibold text-ink-900">Image details</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1.5 text-ink-500 hover:bg-ink-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form
          onSubmit={(event) => {
            event.preventDefault()
            onSave({ title: form.title || null, alt: form.alt || null, folder: form.folder })
          }}
          className="grid gap-5 p-4 sm:grid-cols-[16rem_1fr]"
        >
          <div className="flex flex-col gap-3">
            <span className="block overflow-hidden rounded-lg border border-ink-200 bg-ink-50">
              <img src={item.url} alt={item.alt ?? item.original_name} className="h-full w-full object-contain" />
            </span>

            <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
              {facts.map(([term, value]) => (
                <div key={term} className="col-span-2 flex justify-between gap-3">
                  <dt className="shrink-0 text-ink-400">{term}</dt>
                  <dd className="truncate text-right text-ink-700" title={String(value)}>
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="flex flex-col gap-4">
            <Field
              label="Title"
              hint="What this shop calls the picture. Used when searching the library."
            >
              {({ id }) => (
                <Input
                  id={id}
                  value={form.title}
                  onChange={set('title')}
                  maxLength={200}
                  placeholder={item.original_name}
                  className="w-full"
                />
              )}
            </Field>

            <Field
              label="Alt text"
              hint="What the picture shows, for a shopper whose screen reader is reading the page to them — and for Google. Leave blank only if it is pure decoration."
            >
              {({ id }) => (
                <textarea
                  id={id}
                  rows={3}
                  value={form.alt}
                  onChange={set('alt')}
                  maxLength={200}
                  placeholder="Blue 65W charger with three ports, seen from the front"
                  className="rounded-lg border border-ink-300 bg-white px-3 py-2 text-sm text-ink-900 placeholder:text-ink-400 hover:border-ink-400"
                />
              )}
            </Field>

            <Field label="Folder" hint="Lowercase letters, numbers, dashes and underscores.">
              {({ id }) => (
                <>
                  <Input
                    id={id}
                    value={form.folder}
                    onChange={set('folder')}
                    list="media-folders"
                    maxLength={60}
                    className="w-full"
                  />
                  {/* An existing folder in two keystrokes, a new one by
                      typing it -- the same field either way. */}
                  <datalist id="media-folders">
                    {folders.map((name) => (
                      <option key={name} value={name} />
                    ))}
                  </datalist>
                </>
              )}
            </Field>

            <Field label="Address">
              {({ id }) => (
                <div className="flex gap-2">
                  <Input id={id} value={item.url} readOnly className="w-full" />
                  <Button type="button" variant="secondary" onClick={copyUrl}>
                    Copy
                  </Button>
                  <a
                    {...downloadProps(item)}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-ink-300 px-3 text-sm font-medium text-ink-800 transition-colors hover:bg-ink-50"
                  >
                    <Download className="h-4 w-4" aria-hidden="true" />
                    Download
                  </a>
                </div>
              )}
            </Field>

            <div className="flex gap-2">
              <Button type="submit" loading={saving}>
                Save details
              </Button>
              <Button type="button" variant="secondary" onClick={onClose}>
                Cancel
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  )
}

/**
 * Modal wrapper. Used anywhere a form needs to choose an existing image.
 */
export function MediaPicker({ open, onClose, onSelect, folder, title = 'Choose an image' }) {
  // Escape closes it, the same as every other overlay in the panel.
  useEffect(() => {
    if (!open) return undefined

    const onKey = (event) => {
      if (event.key === 'Escape') onClose()
    }

    document.addEventListener('keydown', onKey)

    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  /*
   * Rendered into <body>, not where it is written.
   *
   * `position: fixed` only escapes the page when no ancestor has made a
   * stacking context, and `position: sticky` makes one -- so a picker opened
   * from inside a sticky column was trapped in that column's layer and any
   * later sibling painted straight over the top of it. A portal is the fix
   * that holds wherever this gets used, rather than a z-index on one caller
   * that the next sticky wrapper quietly breaks again.
   */
  return createPortal(
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
    </div>,
    document.body,
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
