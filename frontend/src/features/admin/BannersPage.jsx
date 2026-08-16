import { useState } from 'react'
import { ArrowDown, ArrowUp, Image as ImageIcon, Megaphone, Plus } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
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
  Textarea,
} from '../../components/ui'

/** Must match BannerController::THEMES on the backend. */
const THEMES = [
  { value: 'brand', label: 'Brand blue', swatch: 'from-brand-600 to-brand-900' },
  { value: 'navy', label: 'Deep navy', swatch: 'from-brand-700 to-navy-900' },
  { value: 'contrast', label: 'High contrast', swatch: 'from-navy-800 to-brand-800' },
]

function forInput(value) {
  if (!value) return ''

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) return ''

  const pad = (n) => String(n).padStart(2, '0')

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

const emptyForm = { eyebrow: '', title: '', body: '', cta_label: 'Shop now', link: '/products', theme: 'brand', image: '', starts_at: '', ends_at: '', is_active: true }

function BannerForm({ form, setForm, onClose }) {
  const write = useWrite('admin.banners', { onSuccess: onClose })
  const [pickingImage, setPickingImage] = useState(false)

  const submit = (event) => {
    event.preventDefault()

    const data = new FormData(event.currentTarget)
    const body = {
      eyebrow: data.get('eyebrow') || null,
      title: data.get('title'),
      body: data.get('body') || null,
      cta_label: data.get('cta_label') || 'Shop now',
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
        <Field
          label="Eyebrow"
          name="eyebrow"
          defaultValue={form.eyebrow}
          placeholder="Shopping fest"
          hint="Small label above the title."
        />

        <Field label="Title" name="title" required defaultValue={form.title} placeholder="Electronics for everyone" />

        <Field label="Body" className="sm:col-span-2">
          {({ id }) => (
            <Textarea
              id={id}
              name="body"
              rows={2}
              defaultValue={form.body}
              placeholder="Audio, charging, and computer accessories stocked in Dhaka."
            />
          )}
        </Field>

        <Field label="Button text" name="cta_label" defaultValue={form.cta_label} />

        <Field
          label="Button link"
          name="link"
          defaultValue={form.link}
          placeholder="/category/audio"
          hint="A path within this shop, starting with /."
        />

        <Field label="Colour theme">
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

        <Field label="Background image" hint="Optional. Shown under the gradient overlay.">
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
          defaultValue={forInput(form.starts_at)}
          hint="Blank = shows immediately."
        />

        <Field
          label="Ends"
          name="ends_at"
          type="datetime-local"
          defaultValue={forInput(form.ends_at)}
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
            The slides at the top of the shop. Shown in this order, only while active and inside their schedule.
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
          description="Without one, the home page shows a plain welcome banner instead."
        />
      ) : (
        <div className="flex flex-col gap-2">
          {banners.map((banner, index) => {
            const theme = THEMES.find((t) => t.value === banner.theme) ?? THEMES[0]

            return (
              <Card key={banner.id} className="flex items-center gap-3 p-3">
                <span className={`h-12 w-20 shrink-0 rounded-lg bg-gradient-to-br ${theme.swatch}`} />

                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 font-medium text-ink-900">
                    {banner.title}
                    {!banner.is_active && <Badge tone="neutral">Off</Badge>}
                  </p>
                  <p className="truncate text-sm text-ink-500">
                    {banner.eyebrow ? `${banner.eyebrow} · ` : ''}
                    {banner.link}
                  </p>
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
                      className="ml-2 text-sm font-medium text-brand-700 hover:underline"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm(`Delete “${banner.title}”?`)) {
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
