import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowDown, ArrowUp, Image as ImageIcon, Search, Shapes, Star } from 'lucide-react'
import { api } from '../../lib/api'
import { cx } from '../../lib/format'
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
  Input,
  Select,
  Spinner,
  TableWrap,
  Td,
  Textarea,
  Th,
  useToast,
} from '../../components/ui'

const emptyForm = { name: '', slug: '', image: '', parent_id: '', description: '', is_active: true, is_featured: false }

/**
 * The form panel. Persistent on the left, WooCommerce-style, rather than a
 * toggled overlay -- adding several categories in a row means never losing
 * the form to go find the "New category" button again.
 *
 * Keyed by the parent on every open/reset (see `formKey` below) so this
 * remounts fresh each time. The text fields and checkboxes below are
 * uncontrolled (`defaultValue`/`defaultChecked`) to match the rest of this
 * codebase's forms -- without a fresh mount, switching from editing one
 * category to another, or resetting after a save, would leave the previous
 * category's values sitting in the DOM even though `form` has moved on.
 */
function CategoryForm({ form, setImage, categories, onCancel, onSaved }) {
  const write = useWrite('admin.categories', { onSuccess: onSaved })
  const [pickingImage, setPickingImage] = useState(false)

  const editing = Boolean(form.id)

  const submit = (event) => {
    event.preventDefault()

    const data = new FormData(event.currentTarget)
    const body = {
      name: data.get('name'),
      slug: data.get('slug') || null,
      parent_id: data.get('parent_id') || null,
      description: data.get('description') || null,
      image: form.image || null,
      is_active: data.get('is_active') === 'on',
      is_featured: data.get('is_featured') === 'on',
    }

    if (editing) {
      write.mutate({ method: 'put', url: `/admin/categories/${form.id}`, body })
    } else {
      write.mutate({ url: '/admin/categories', body })
    }
  }

  return (
    <Card>
      <MediaPicker
        open={pickingImage}
        onClose={() => setPickingImage(false)}
        onSelect={(item) => {
          setImage(item.url)
          setPickingImage(false)
        }}
        folder="categories"
        title="Choose an image"
      />

      <CardHeader title={editing ? 'Edit category' : 'Add new category'} />

      <form onSubmit={submit} className="flex flex-col gap-4 p-4">
        <Field label="Name" name="name" required defaultValue={form.name} />

        <Field
          label="Slug"
          name="slug"
          defaultValue={form.slug}
          placeholder="left blank, made from the name"
          hint="Changing this on a live category breaks links people have saved."
        />

        <Field label="Parent category">
          {({ id }) => (
            <Select id={id} name="parent_id" defaultValue={form.parent_id ?? ''}>
              <option value="">None (top level)</option>
              {categories
                .filter((category) => category.id !== form.id)
                .map((category) => (
                  <option key={category.id} value={category.id}>
                    {'— '.repeat(category.depth)}
                    {category.name}
                  </option>
                ))}
            </Select>
          )}
        </Field>

        <Field label="Description" hint="Not shown on the storefront by default.">
          {({ id }) => (
            <Textarea id={id} name="description" rows={3} defaultValue={form.description} />
          )}
        </Field>

        <Field label="Thumbnail" hint="Shown in the category menu and on the storefront.">
          {() => (
            <div className="flex items-center gap-3">
              <span className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-lg border border-ink-200 bg-ink-50">
                {form.image ? (
                  <img src={form.image} alt="" className="h-full w-full object-cover" />
                ) : (
                  <ImageIcon className="h-5 w-5 text-ink-400" aria-hidden="true" />
                )}
              </span>

              <Button type="button" variant="secondary" size="sm" onClick={() => setPickingImage(true)}>
                {form.image ? 'Change' : 'Upload / add image'}
              </Button>

              {form.image && (
                <Button type="button" variant="ghost" size="sm" onClick={() => setImage('')}>
                  Remove
                </Button>
              )}
            </div>
          )}
        </Field>

        <label className="flex items-center gap-2 text-sm text-ink-800">
          <input
            type="checkbox"
            name="is_active"
            defaultChecked={form.is_active}
            className="h-4 w-4 rounded border-ink-300 text-brand-600"
          />
          Active
        </label>

        <label className="flex items-start gap-2 text-sm text-ink-800">
          <input
            type="checkbox"
            name="is_featured"
            defaultChecked={form.is_featured}
            className="mt-0.5 h-4 w-4 rounded border-ink-300 text-brand-600"
          />
          <span>
            Show on home page
            <span className="block text-xs font-normal text-ink-500">
              Gets its own product strip on the home page. Order below decides which show first.
            </span>
          </span>
        </label>

        <div className="flex gap-2">
          <Button type="submit" loading={write.isPending}>
            {editing ? 'Save changes' : 'Add new category'}
          </Button>
          {editing && (
            <Button type="button" variant="secondary" onClick={onCancel}>
              Cancel
            </Button>
          )}
        </div>
      </form>
    </Card>
  )
}

export default function CategoriesPage() {
  const can = useAuthStore((state) => state.can)
  const editable = can('categories.manage')
  const toast = useToast()
  const queryClient = useQueryClient()

  const query = useList('admin.categories', '/admin/categories')
  const remove = useWrite('admin.categories')

  const [form, setForm] = useState({ ...emptyForm })
  const [formKey, setFormKey] = useState(0)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(new Set())

  // Bumping the key forces CategoryForm to remount, so its uncontrolled
  // fields always start fresh -- switching straight from editing one
  // category to another (or resetting after a save) would otherwise leave
  // the previous category's values sitting in the DOM.
  const openForm = (next) => {
    setForm(next)
    setFormKey((key) => key + 1)
  }

  const categories = query.data?.data ?? []

  /*
   * A one-click toggle rather than opening the form for a single checkbox.
   * The endpoint's validation requires the rest of the fields on every
   * update, so the row's current values travel along -- only is_featured
   * actually changes.
   */
  const toggleFeatured = (category) => {
    remove.mutate({
      method: 'put',
      url: `/admin/categories/${category.id}`,
      body: {
        name: category.name,
        slug: category.slug,
        parent_id: category.parent_id,
        description: category.description,
        image: category.image,
        is_active: category.is_active,
        is_featured: !category.is_featured,
      },
    })
  }

  const reorder = useMutation({
    mutationFn: (order) => api.post('/admin/categories/reorder', { order }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin.categories'] }),
  })

  const bulk = useMutation({
    mutationFn: async (payload) => {
      const { data } = await api.post('/admin/categories/bulk', payload)

      return data
    },
    onSuccess(data) {
      toast.success(data.message)
      setSelected(new Set())
      queryClient.invalidateQueries({ queryKey: ['admin.categories'] })
    },
    onError(error) {
      toast.error(error?.message ?? 'That did not work.')
    },
  })

  const term = search.trim().toLowerCase()
  const visible = term
    ? categories.filter(
        (category) =>
          category.name.toLowerCase().includes(term) || category.slug?.toLowerCase().includes(term),
      )
    : categories

  // Siblings share a parent, and only siblings are reordered against each
  // other -- position is compared within a parent, never across the whole
  // tree, so moving "Audio" past "Chargers" must never also involve
  // "Earbuds" three levels down.
  const siblingsOf = (category) => categories.filter((c) => c.parent_id === category.parent_id)

  const move = (category, direction) => {
    const siblings = siblingsOf(category)
    const index = siblings.findIndex((c) => c.id === category.id)
    const target = index + direction

    if (target < 0 || target >= siblings.length) return

    const next = [...siblings]
    ;[next[index], next[target]] = [next[target], next[index]]
    reorder.mutate(next.map((c) => c.id))
  }

  useEffect(() => {
    setSelected(new Set())
  }, [term])

  const toggle = (id) => {
    setSelected((previous) => {
      const next = new Set(previous)

      next.has(id) ? next.delete(id) : next.add(id)

      return next
    })
  }

  const allVisibleSelected = visible.length > 0 && visible.every((category) => selected.has(category.id))

  if (query.isError) return <ErrorState error={query.error} onRetry={query.refetch} />

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-ink-900">Product categories</h1>
        <p className="mt-0.5 text-sm text-ink-500">
          Up to four levels deep. Use the arrows to set the order categories appear in the menu and on
          the home page.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[20rem_1fr] lg:items-start">
        {editable && (
          <CategoryForm
            key={formKey}
            form={form}
            setImage={(url) => setForm((current) => ({ ...current, image: url }))}
            categories={categories}
            onCancel={() => openForm({ ...emptyForm })}
            onSaved={() => openForm({ ...emptyForm })}
          />
        )}

        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="relative w-full max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" aria-hidden="true" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search categories"
                aria-label="Search categories"
                className="pl-9"
              />
            </div>

            <p className="text-sm text-ink-500">{visible.length} categories</p>
          </div>

          {editable && selected.size > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-card border border-brand-300 bg-brand-50 p-3">
              <p className="text-sm font-medium text-ink-900">{selected.size} selected</p>

              <button
                type="button"
                onClick={() => setSelected(new Set())}
                className="text-sm text-ink-600 underline hover:text-ink-900"
              >
                Clear
              </button>

              <Button
                size="sm"
                variant="danger"
                className="ml-auto"
                loading={bulk.isPending}
                onClick={() => {
                  if (!window.confirm(`Delete ${selected.size} categor${selected.size === 1 ? 'y' : 'ies'}?`)) return

                  bulk.mutate({ action: 'delete', ids: [...selected] })
                }}
              >
                Delete
              </Button>
            </div>
          )}

          {query.isLoading ? (
            <div className="grid place-items-center py-16">
              <Spinner />
            </div>
          ) : visible.length === 0 ? (
            <EmptyState
              icon={Shapes}
              title={term ? 'No categories match that search' : 'No categories yet'}
              description={term ? undefined : 'Every product needs one.'}
            />
          ) : (
            <TableWrap>
              <thead>
                <tr>
                  {editable && (
                    <Th className="w-10">
                      <input
                        type="checkbox"
                        checked={allVisibleSelected}
                        onChange={(event) =>
                          setSelected(
                            event.target.checked ? new Set(visible.map((c) => c.id)) : new Set(),
                          )
                        }
                        aria-label="Select every visible category"
                        className="h-4 w-4 rounded border-ink-300 text-brand-600"
                      />
                    </Th>
                  )}
                  <Th className="w-14">Image</Th>
                  <Th>Name</Th>
                  <Th numeric>Products</Th>
                  <Th>Status</Th>
                  <Th>Home page</Th>
                  {editable && <Th>Order</Th>}
                  <Th />
                </tr>
              </thead>
              <tbody>
                {visible.map((category) => {
                  const siblings = siblingsOf(category)
                  const siblingIndex = siblings.findIndex((c) => c.id === category.id)

                  return (
                    <tr
                      key={category.id}
                      className={cx('hover:bg-ink-50', selected.has(category.id) && 'bg-brand-50')}
                    >
                      {editable && (
                        <Td>
                          <input
                            type="checkbox"
                            checked={selected.has(category.id)}
                            onChange={() => toggle(category.id)}
                            aria-label={`Select ${category.name}`}
                            className="h-4 w-4 rounded border-ink-300 text-brand-600"
                          />
                        </Td>
                      )}
                      <Td>
                        <span className="grid h-9 w-9 place-items-center overflow-hidden rounded-lg border border-ink-200 bg-ink-50">
                          {category.image ? (
                            <img src={category.image} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <ImageIcon className="h-4 w-4 text-ink-300" aria-hidden="true" />
                          )}
                        </span>
                      </Td>
                      <Td>
                        <span style={{ paddingLeft: `${category.depth * 16}px` }} className="font-medium text-ink-900">
                          {category.name}
                        </span>
                        <span className="ml-2 text-xs text-ink-400">{category.slug}</span>
                      </Td>
                      <Td numeric>{category.products_count ?? 0}</Td>
                      <Td>
                        <Badge tone={category.is_active ? 'success' : 'neutral'}>
                          {category.is_active ? 'Active' : 'Hidden'}
                        </Badge>
                      </Td>
                      <Td>
                        {editable ? (
                          <button
                            type="button"
                            onClick={() => toggleFeatured(category)}
                            disabled={remove.isPending}
                            title={category.is_featured ? 'Remove from home page' : 'Show on home page'}
                            className={cx(
                              'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium transition-colors disabled:opacity-50',
                              category.is_featured
                                ? 'bg-warning-50 text-warning-700 hover:bg-warning-100'
                                : 'text-ink-400 hover:bg-ink-100 hover:text-ink-600',
                            )}
                          >
                            <Star
                              className={cx('h-3.5 w-3.5', category.is_featured && 'fill-current')}
                              aria-hidden="true"
                            />
                            {category.is_featured ? 'Featured' : 'Off'}
                          </button>
                        ) : category.is_featured ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-warning-700">
                            <Star className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
                            Featured
                          </span>
                        ) : (
                          <span className="text-xs text-ink-400">—</span>
                        )}
                      </Td>
                      {editable && (
                        <Td>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => move(category, -1)}
                              disabled={siblingIndex <= 0}
                              aria-label={`Move ${category.name} up`}
                              className="grid h-7 w-7 place-items-center rounded text-ink-500 hover:bg-ink-100 disabled:opacity-30"
                            >
                              <ArrowUp className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => move(category, 1)}
                              disabled={siblingIndex >= siblings.length - 1}
                              aria-label={`Move ${category.name} down`}
                              className="grid h-7 w-7 place-items-center rounded text-ink-500 hover:bg-ink-100 disabled:opacity-30"
                            >
                              <ArrowDown className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </Td>
                      )}
                      <Td className="text-right">
                        {editable && (
                          <div className="flex justify-end gap-3">
                            <button
                              type="button"
                              onClick={() =>
                                openForm({
                                  id: category.id,
                                  name: category.name,
                                  slug: category.slug ?? '',
                                  image: category.image ?? '',
                                  parent_id: category.parent_id ?? '',
                                  description: category.description ?? '',
                                  is_active: category.is_active,
                                  is_featured: category.is_featured,
                                })
                              }
                              className="text-sm font-medium text-brand-700 hover:underline"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                if (window.confirm(`Delete "${category.name}"?`)) {
                                  remove.mutate({ method: 'delete', url: `/admin/categories/${category.id}` })
                                }
                              }}
                              className="text-sm font-medium text-danger-700 hover:underline"
                            >
                              Delete
                            </button>
                          </div>
                        )}
                      </Td>
                    </tr>
                  )
                })}
              </tbody>
            </TableWrap>
          )}
        </div>
      </div>
    </div>
  )
}
