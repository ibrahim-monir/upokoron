import { useState } from 'react'
import { ArrowDown, ArrowUp, Image as ImageIcon, Megaphone, Plus } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { datetimeLocalValue } from '../../lib/format'
import { useList, useWrite } from './useResource'
import { useAuthStore } from '../../stores/authStore'
import { MediaPicker } from './media/MediaLibrary'
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  Field,
  Spinner,
} from '../../components/ui'

/** Must match BannerController::THEMES on the backend. */
const THEMES = [
  { value: 'brand', label: 'Brand blue', swatch: 'from-brand-600 to-brand-900' },
  { value: 'navy', label: 'Deep navy', swatch: 'from-brand-700 to-navy-900' },
  { value: 'contrast', label: 'High contrast', swatch: 'from-navy-800 to-brand-800' },
]

const emptyForm = { link: '/products', theme: 'brand', image: '', starts_at: '', ends_at: '', is_active: true }

function BannerForm({ form, setForm, onClose }) {
  const write = useWrite('admin.banners', { onSuccess: onClose })
  const [pickingImage, setPickingImage] = useState(false)

  const submit = (event) => {
    event.preventDefault()

    const data = new FormData(event.currentTarget)
    const body = {
      link: data.get('link') || '/products',
      theme: form.theme,
      image: form.image || null,
      starts_at: data.get('starts_at') || null,
      ends_at: data.get('ends_at') || null,
      is_active: data.get('is_active') === 'on',
    }

    if (form.id) {
      write.mutate({ method: 'put', url: `/admin/banners/${form.id}`, body })
    } else {
      write.mutate({ url: '/admin/banners', body })
    }
  }

  return (
    <Card>
      <MediaPicker
        open={pickingImage}
        onClose={() => setPickingImage(false)}
        onSelect={(item) => {
          setForm((current) => ({ ...current, image: item.url }))
          setPickingImage(false)
        }}
        folder="banners"
        title="Choose a background image"
      />

      <CardHeader title={form.id ? 'Edit banner' : 'New banner'} />

      <form onSubmit={submit} className="grid gap-4 p-4 sm:grid-cols-2">
        {/*
          A banner is artwork and a destination. The headline, sub-heading and
          button label that used to be typed here are gone: a slide's words
          belong in the picture, positioned where the picture has room for
          them, not dropped on top of it by a layout that cannot see it.
        */}
        <Field
          label="Slide links to"
          name="link"
          defaultValue={form.link}
          placeholder="/category/audio"
          hint="A path within this shop, starting with /. The whole slide is clickable."
        />

        <Field label="Colour behind the image" hint="Seen while the picture loads, and on any edge it does not cover.">
          {() => (
            <div className="flex gap-2">
              {THEMES.map((theme) => (
                <button
                  key={theme.value}
                  type="button"
                  onClick={() => setForm((current) => ({ ...current, theme: theme.value }))}
                  aria-pressed={form.theme === theme.value}
                  title={theme.label}
                  className={`h-9 flex-1 rounded-lg bg-gradient-to-br ${theme.swatch} ring-2 transition-shadow ${
                    form.theme === theme.value ? 'ring-brand-600' : 'ring-transparent'
                  }`}
                />
              ))}
            </div>
          )}
        </Field>

        <Field label="Slide image" required hint="This is the slide. Landscape artwork, roughly 1600×600, with any wording already on it — the sides are cropped on a phone, so keep the words near the middle.">
          {() => (
            <div className="flex items-center gap-3">
              <span className="grid h-14 w-24 shrink-0 place-items-center overflow-hidden rounded-lg border border-ink-200 bg-ink-50">
                {form.image ? (
                  <img src={form.image} alt="" className="h-full w-full object-cover" />
                ) : (
                  <ImageIcon className="h-5 w-5 text-ink-400" aria-hidden="true" />
                )}
              </span>

              <Button type="button" variant="secondary" size="sm" onClick={() => setPickingImage(true)}>
                {form.image ? 'Change' : 'Choose'}
              </Button>

              {form.image && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setForm((current) => ({ ...current, image: '' }))}
                >
                  Remove
                </Button>
              )}
            </div>
          )}
        </Field>

        <Field
          label="Starts"
          name="starts_at"
          type="datetime-local"
          defaultValue={datetimeLocalValue(form.starts_at)}
          hint="Blank = shows immediately."
        />

        <Field
          label="Ends"
          name="ends_at"
          type="datetime-local"
          defaultValue={datetimeLocalValue(form.ends_at)}
          hint="Blank = runs indefinitely."
        />

        <label className="flex items-center gap-2 self-end pb-2 text-sm text-ink-700 sm:col-span-2">
          <input type="checkbox" name="is_active" defaultChecked={form.is_active} className="h-4 w-4 rounded border-ink-300" />
          Active
        </label>

        <div className="flex gap-2 sm:col-span-2">
          <Button type="submit" loading={write.isPending}>
            {form.id ? 'Save' : 'Create'}
          </Button>
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  )
}

export default function BannersPage() {
  const can = useAuthStore((state) => state.can)
  const query = useList('admin.banners', '/admin/banners')
  const write = useWrite('admin.banners')
  const queryClient = useQueryClient()
  const [form, setForm] = useState(null)

  const reorder = useMutation({
    mutationFn: (order) => api.post('/admin/banners/reorder', { order }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin.banners'] }),
  })

  const banners = query.data?.data ?? []
  const editable = can('banners.manage')

  const move = (index, direction) => {
    const next = [...banners]
    const target = index + direction

    if (target < 0 || target >= next.length) return

    ;[next[index], next[target]] = [next[target], next[index]]
    reorder.mutate(next.map((banner) => banner.id))
  }

  if (query.isLoading) {
    return (
      <div className="grid place-items-center py-16">
        <Spinner />
      </div>
    )
  }

  if (query.isError) return <ErrorState error={query.error} onRetry={query.refetch} />

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink-900">Home page banners</h1>
          <p className="mt-0.5 text-sm text-ink-500">
            The pictures at the top of the shop. Shown in this order, only while active and inside their
            schedule. Each one is a single image that links wherever you point it.
          </p>
        </div>

        {editable && !form && (
          <Button onClick={() => setForm({ ...emptyForm })}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            New banner
          </Button>
        )}
      </div>

      {form && <BannerForm form={form} setForm={setForm} onClose={() => setForm(null)} />}

      {banners.length === 0 ? (
        <EmptyState
          icon={Megaphone}
          title="No banners yet"
          description="Until there is one, the top of the home page is a plain coloured panel."
        />
      ) : (
        <div className="flex flex-col gap-2">
          {banners.map((banner, index) => {
            const theme = THEMES.find((t) => t.value === banner.theme) ?? THEMES[0]

            return (
              <Card key={banner.id} className="flex items-center gap-3 p-3">
                {/* The artwork itself, not a colour chip -- with no title on
                    the row it is the only way to tell one slide from another. */}
                <span className={`grid h-12 w-20 shrink-0 place-items-center overflow-hidden rounded-lg bg-gradient-to-br ${theme.swatch}`}>
                  {banner.image ? (
                    <img src={banner.image} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <ImageIcon className="h-4 w-4 text-white/70" aria-hidden="true" />
                  )}
                </span>

                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 font-medium text-ink-900">
                    Slide {index + 1}
                    {!banner.is_active && <Badge tone="neutral">Off</Badge>}
                    {!banner.image && <Badge tone="warning">No image - not shown</Badge>}
                  </p>
                  <p className="truncate text-sm text-ink-500">{banner.link}</p>
                </div>

                {editable && (
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => move(index, -1)}
                      disabled={index === 0}
                      aria-label="Move up"
                      className="grid h-7 w-7 place-items-center rounded text-ink-500 hover:bg-ink-100 disabled:opacity-30"
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => move(index, 1)}
                      disabled={index === banners.length - 1}
                      aria-label="Move down"
                      className="grid h-7 w-7 place-items-center rounded text-ink-500 hover:bg-ink-100 disabled:opacity-30"
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </button>

                    <button
                      type="button"
                      onClick={() => setForm({ ...banner, starts_at: banner.starts_at ?? '', ends_at: banner.ends_at ?? '' })}
                      className="ml-2 text-sm font-medium text-brand-800 hover:underline"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm(`Delete slide ${index + 1}?`)) {
                          write.mutate({ method: 'delete', url: `/admin/banners/${banner.id}` })
                        }
                      }}
                      className="ml-2 text-sm font-medium text-danger-700 hover:underline"
                    >
                      Delete
                    </button>
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
