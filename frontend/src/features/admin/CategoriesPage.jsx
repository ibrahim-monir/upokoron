import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronRight,
  FolderTree,
  Image as ImageIcon,
  Layers3,
  MoreHorizontal,
  Package,
  Plus,
  Search,
  Shapes,
  Star,
  Tag,
  Trash2,
  X,
} from 'lucide-react'

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

const emptyForm = {
  name: '',
  slug: '',
  image: '',
  parent_id: '',
  description: '',
  is_active: true,
  is_featured: false,
}

/* -------------------------------------------------------------------------- */
/* Small reusable UI pieces                                                   */
/* -------------------------------------------------------------------------- */

function StatCard({ icon: Icon, label, value, description }) {
  return (
    <div className="group rounded-2xl border border-ink-200 bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-ink-500">
            {label}
          </p>

          <p className="mt-1 text-2xl font-bold tracking-tight text-ink-950">
            {value}
          </p>

          {description && (
            <p className="mt-1 text-xs text-ink-500">
              {description}
            </p>
          )}
        </div>

        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700 transition-colors group-hover:bg-brand-100">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </div>
      </div>
    </div>
  )
}

function Toggle({ checked, onChange, label, description, disabled = false }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-4 rounded-xl border border-ink-200 bg-white p-3 text-left transition hover:border-ink-300 hover:bg-ink-50 disabled:cursor-not-allowed disabled:opacity-60"
    >
      <span className="min-w-0">
        <span className="block text-sm font-medium text-ink-900">
          {label}
        </span>

        {description && (
          <span className="mt-0.5 block text-xs leading-5 text-ink-500">
            {description}
          </span>
        )}
      </span>

      <span
        className={cx(
          'relative h-6 w-11 shrink-0 rounded-full transition-colors',
          checked ? 'bg-brand-600' : 'bg-ink-300',
        )}
      >
        <span
          className={cx(
            'absolute top-1 h-4 w-4 rounded-full bg-white shadow-sm transition-transform',
            checked ? 'translate-x-6' : 'translate-x-1',
          )}
        />
      </span>
    </button>
  )
}

/* -------------------------------------------------------------------------- */
/* Category form                                                              */
/* -------------------------------------------------------------------------- */

function CategoryForm({
  form,
  setImage,
  setForm,
  categories,
  onCancel,
  onSaved,
}) {
  const write = useWrite('admin.categories', {
    onSuccess: onSaved,
  })

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
      is_active: form.is_active,
      is_featured: form.is_featured,
    }

    if (editing) {
      write.mutate({
        method: 'put',
        url: `/admin/categories/${form.id}`,
        body,
      })
    } else {
      write.mutate({
        url: '/admin/categories',
        body,
      })
    }
  }

  return (
    <>
      <MediaPicker
        open={pickingImage}
        onClose={() => setPickingImage(false)}
        onSelect={(item) => {
          setImage(item.url)
          setPickingImage(false)
        }}
        folder="categories"
        title="Choose category image"
      />

      <Card className="overflow-hidden rounded-2xl">
        {/* Form heading */}
        <div className="border-b border-ink-100 bg-gradient-to-br from-brand-50 via-white to-white px-5 py-4">
          <div className="flex items-start gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-100 text-brand-700">
              {editing ? (
                <Tag className="h-5 w-5" />
              ) : (
                <Plus className="h-5 w-5" />
              )}
            </div>

            <div className="min-w-0">
              <h2 className="text-base font-semibold text-ink-950">
                {editing ? 'Edit category' : 'Add category'}
              </h2>

              <p className="mt-0.5 text-xs leading-5 text-ink-500">
                {editing
                  ? 'Update category information and storefront settings.'
                  : 'Create a new category for your product catalogue.'}
              </p>
            </div>
          </div>
        </div>

        <form onSubmit={submit} className="flex flex-col gap-5 p-5">
          {/* -------------------------------------------------------------- */}
          {/* Basic information                                               */}
          {/* -------------------------------------------------------------- */}

          <div>
            <div className="mb-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-ink-500">
                Basic information
              </p>
            </div>

            <div className="flex flex-col gap-4">
              <Field
                label="Category name"
                required
                name="name"
                defaultValue={form.name}
                placeholder="e.g. Mobile Accessories"
              />

              <Field
                label="Slug"
                name="slug"
                defaultValue={form.slug}
                placeholder="mobile-accessories"
                hint="Leave blank to generate automatically."
              />

              <Field
                label="Parent category"
                hint="Keep it as None for a top-level category."
              >
                {({ id }) => (
                  <Select
                    id={id}
                    name="parent_id"
                    defaultValue={form.parent_id ?? ''}
                  >
                    <option value="">None — Top level</option>

                    {categories
                      .filter((category) => category.id !== form.id)
                      .map((category) => (
                        <option key={category.id} value={category.id}>
                          {'— '.repeat(category.depth ?? 0)}
                          {category.name}
                        </option>
                      ))}
                  </Select>
                )}
              </Field>
            </div>
          </div>

          {/* -------------------------------------------------------------- */}
          {/* Image                                                           */}
          {/* -------------------------------------------------------------- */}

          <div className="border-t border-ink-100 pt-5">
            <div className="mb-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-ink-500">
                Category image
              </p>

              <p className="mt-1 text-xs text-ink-500">
                Used in category menus, cards and storefront sections.
              </p>
            </div>

            <div className="rounded-2xl border border-dashed border-ink-300 bg-ink-50/70 p-3">
              <div className="flex items-center gap-3">
                <div className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-xl border border-ink-200 bg-white shadow-sm">
                  {form.image ? (
                    <img
                      src={form.image}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <ImageIcon className="h-6 w-6 text-ink-300" />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ink-800">
                    {form.image ? 'Category image selected' : 'No image selected'}
                  </p>

                  <p className="mt-1 text-xs leading-5 text-ink-500">
                    Use a clean square image for the best storefront result.
                  </p>

                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => setPickingImage(true)}
                    >
                      <ImageIcon className="h-3.5 w-3.5" />
                      {form.image ? 'Change image' : 'Choose image'}
                    </Button>

                    {form.image && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setImage('')}
                      >
                        <X className="h-3.5 w-3.5" />
                        Remove
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* -------------------------------------------------------------- */}
          {/* Description                                                     */}
          {/* -------------------------------------------------------------- */}

          <div className="border-t border-ink-100 pt-5">
            <div className="mb-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-ink-500">
                Description
              </p>
            </div>

            <Field
              label="Category description"
              hint="Optional. Useful for SEO and category landing pages."
            >
              {({ id }) => (
                <Textarea
                  id={id}
                  name="description"
                  rows={4}
                  defaultValue={form.description}
                  placeholder="Write a short description about this category..."
                />
              )}
            </Field>
          </div>

          {/* -------------------------------------------------------------- */}
          {/* Visibility                                                      */}
          {/* -------------------------------------------------------------- */}

          <div className="border-t border-ink-100 pt-5">
            <div className="mb-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-ink-500">
                Visibility
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <Toggle
                checked={form.is_active}
                onChange={(value) =>
                  setForm((current) => ({
                    ...current,
                    is_active: value,
                  }))
                }
                label="Active category"
                description="Customers can see this category on the storefront."
              />

              <Toggle
                checked={form.is_featured}
                onChange={(value) =>
                  setForm((current) => ({
                    ...current,
                    is_featured: value,
                  }))
                }
                label="Featured on home page"
                description="Show this category in a featured home-page section."
              />
            </div>
          </div>

          {/* -------------------------------------------------------------- */}
          {/* Actions                                                         */}
          {/* -------------------------------------------------------------- */}

          <div className="flex items-center gap-2 border-t border-ink-100 pt-5">
            <Button
              type="submit"
              loading={write.isPending}
              className="flex-1"
            >
              {editing ? 'Save changes' : 'Create category'}
            </Button>

            {editing && (
              <Button
                type="button"
                variant="secondary"
                onClick={onCancel}
              >
                Cancel
              </Button>
            )}
          </div>
        </form>
      </Card>
    </>
  )
}

/* -------------------------------------------------------------------------- */
/* Main page                                                                  */
/* -------------------------------------------------------------------------- */

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

  const categories = query.data?.data ?? []

  const openForm = (next) => {
    setForm(next)
    setFormKey((key) => key + 1)
  }

  const activeCount = useMemo(
    () => categories.filter((category) => category.is_active).length,
    [categories],
  )

  const featuredCount = useMemo(
    () => categories.filter((category) => category.is_featured).length,
    [categories],
  )

  const totalProducts = useMemo(
    () =>
      categories.reduce(
        (total, category) => total + Number(category.products_count ?? 0),
        0,
      ),
    [categories],
  )

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

  const toggleActive = (category) => {
    remove.mutate({
      method: 'put',
      url: `/admin/categories/${category.id}`,
      body: {
        name: category.name,
        slug: category.slug,
        parent_id: category.parent_id,
        description: category.description,
        image: category.image,
        is_active: !category.is_active,
        is_featured: category.is_featured,
      },
    })
  }

  const reorder = useMutation({
    mutationFn: (order) =>
      api.post('/admin/categories/reorder', {
        order,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['admin.categories'],
      })
    },
    onError: (error) => {
      toast.error(error?.message ?? 'Could not reorder categories.')
    },
  })

  const bulk = useMutation({
    mutationFn: async (payload) => {
      const { data } = await api.post(
        '/admin/categories/bulk',
        payload,
      )

      return data
    },

    onSuccess(data) {
      toast.success(data.message)
      setSelected(new Set())

      queryClient.invalidateQueries({
        queryKey: ['admin.categories'],
      })
    },

    onError(error) {
      toast.error(error?.message ?? 'That did not work.')
    },
  })

  const term = search.trim().toLowerCase()

  const visible = term
    ? categories.filter(
        (category) =>
          category.name.toLowerCase().includes(term) ||
          category.slug?.toLowerCase().includes(term),
      )
    : categories

  const siblingsOf = (category) =>
    categories.filter(
      (c) => c.parent_id === category.parent_id,
    )

  const move = (category, direction) => {
    const siblings = siblingsOf(category)

    const index = siblings.findIndex(
      (c) => c.id === category.id,
    )

    const target = index + direction

    if (target < 0 || target >= siblings.length) return

    const next = [...siblings]

    ;[next[index], next[target]] = [
      next[target],
      next[index],
    ]

    reorder.mutate(next.map((c) => c.id))
  }

  useEffect(() => {
    setSelected(new Set())
  }, [term])

  const toggle = (id) => {
    setSelected((previous) => {
      const next = new Set(previous)

      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }

      return next
    })
  }

  const allVisibleSelected =
    visible.length > 0 &&
    visible.every((category) =>
      selected.has(category.id),
    )

  if (query.isError) {
    return (
      <ErrorState
        error={query.error}
        onRetry={query.refetch}
      />
    )
  }

  return (
    <div className="flex flex-col gap-6 pb-8">
      {/* ================================================================== */}
      {/* HEADER                                                             */}
      {/* ================================================================== */}

      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-medium text-brand-700">
            <FolderTree className="h-4 w-4" />
            Catalogue
            <ChevronRight className="h-3.5 w-3.5 text-ink-300" />
            Categories
          </div>

          <h1 className="mt-2 text-2xl font-bold tracking-tight text-ink-950">
            Product categories
          </h1>

          <p className="mt-1 max-w-2xl text-sm leading-6 text-ink-500">
            Organize your products into a clean category hierarchy
            and control how categories appear across the storefront.
          </p>
        </div>

        {editable && (
          <Button
            onClick={() => openForm({ ...emptyForm })}
            className="shrink-0"
          >
            <Plus className="h-4 w-4" />
            Add category
          </Button>
        )}
      </div>

      {/* ================================================================== */}
      {/* STATS                                                              */}
      {/* ================================================================== */}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          icon={Layers3}
          label="Total categories"
          value={categories.length}
          description="Across your catalogue"
        />

        <StatCard
          icon={Check}
          label="Active"
          value={activeCount}
          description={`${categories.length ? Math.round((activeCount / categories.length) * 100) : 0}% visible`}
        />

        <StatCard
          icon={Star}
          label="Featured"
          value={featuredCount}
          description="Shown on homepage"
        />

        <StatCard
          icon={Package}
          label="Products"
          value={totalProducts.toLocaleString()}
          description="Assigned to categories"
        />
      </div>

      {/* ================================================================== */}
      {/* MAIN GRID                                                          */}
      {/* ================================================================== */}

      <div className="grid items-start gap-5 xl:grid-cols-[22rem_minmax(0,1fr)]">
        {/* ---------------------------------------------------------------- */}
        {/* FORM                                                             */}
        {/* ---------------------------------------------------------------- */}

        {editable && (
          <div className="xl:sticky xl:top-5">
            <CategoryForm
              key={formKey}
              form={form}
              setForm={setForm}
              setImage={(url) =>
                setForm((current) => ({
                  ...current,
                  image: url,
                }))
              }
              categories={categories}
              onCancel={() =>
                openForm({
                  ...emptyForm,
                })
              }
              onSaved={() =>
                openForm({
                  ...emptyForm,
                })
              }
            />
          </div>
        )}

        {/* ---------------------------------------------------------------- */}
        {/* LIST                                                             */}
        {/* ---------------------------------------------------------------- */}

        <div className="min-w-0">
          <Card className="overflow-hidden rounded-2xl">
            {/* Toolbar */}
            <div className="flex flex-col gap-3 border-b border-ink-100 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative w-full sm:max-w-sm">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400"
                  aria-hidden="true"
                />

                <Input
                  value={search}
                  onChange={(event) =>
                    setSearch(event.target.value)
                  }
                  placeholder="Search category or slug..."
                  aria-label="Search categories"
                  className="h-10 pl-9"
                />

                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch('')}
                    className="absolute right-2 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-md text-ink-400 hover:bg-ink-100 hover:text-ink-700"
                    aria-label="Clear search"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-ink-500">
                  <strong className="font-semibold text-ink-800">
                    {visible.length}
                  </strong>{' '}
                  categories
                </span>

                {term && (
                  <Badge tone="neutral">
                    Filtered
                  </Badge>
                )}
              </div>
            </div>

            {/* Bulk toolbar */}
            {editable && selected.size > 0 && (
              <div className="flex flex-wrap items-center gap-3 border-b border-brand-200 bg-brand-50 px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="grid h-7 w-7 place-items-center rounded-lg bg-brand-100 text-xs font-bold text-brand-700">
                    {selected.size}
                  </span>

                  <span className="text-sm font-medium text-ink-900">
                    selected
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    setSelected(new Set())
                  }
                  className="text-xs font-medium text-ink-600 hover:text-ink-900 hover:underline"
                >
                  Clear selection
                </button>

                <Button
                  size="sm"
                  variant="danger"
                  className="ml-auto"
                  loading={bulk.isPending}
                  onClick={() => {
                    if (
                      !window.confirm(
                        `Delete ${selected.size} categor${
                          selected.size === 1 ? 'y' : 'ies'
                        }?`,
                      )
                    ) {
                      return
                    }

                    bulk.mutate({
                      action: 'delete',
                      ids: [...selected],
                    })
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete selected
                </Button>
              </div>
            )}

            {/* Loading */}
            {query.isLoading ? (
              <div className="grid place-items-center py-20">
                <Spinner />
              </div>
            ) : visible.length === 0 ? (
              <div className="p-8">
                <EmptyState
                  icon={Shapes}
                  title={
                    term
                      ? 'No categories found'
                      : 'No categories yet'
                  }
                  description={
                    term
                      ? 'Try a different category name or slug.'
                      : 'Create your first product category to get started.'
                  }
                />
              </div>
            ) : (
              <TableWrap>
                <thead>
                  <tr className="bg-ink-50/70">
                    {editable && (
                      <Th className="w-10">
                        <input
                          type="checkbox"
                          checked={allVisibleSelected}
                          onChange={(event) =>
                            setSelected(
                              event.target.checked
                                ? new Set(
                                    visible.map(
                                      (c) => c.id,
                                    ),
                                  )
                                : new Set(),
                            )
                          }
                          aria-label="Select all categories"
                          className="h-4 w-4 rounded border-ink-300 text-brand-600 focus:ring-brand-500"
                        />
                      </Th>
                    )}

                    <Th className="w-16">Image</Th>
                    <Th>Category</Th>
                    <Th numeric>Products</Th>
                    <Th>Status</Th>
                    <Th>Featured</Th>
                    {editable && <Th>Order</Th>}
                    <Th />
                  </tr>
                </thead>

                <tbody className="divide-y divide-ink-100">
                  {visible.map((category) => {
                    const siblings = siblingsOf(category)

                    const siblingIndex =
                      siblings.findIndex(
                        (c) => c.id === category.id,
                      )

                    const isSelected =
                      selected.has(category.id)

                    return (
                      <tr
                        key={category.id}
                        className={cx(
                          'group transition-colors',
                          isSelected
                            ? 'bg-brand-50/70'
                            : 'hover:bg-ink-50/70',
                        )}
                      >
                        {/* Select */}
                        {editable && (
                          <Td>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() =>
                                toggle(category.id)
                              }
                              aria-label={`Select ${category.name}`}
                              className="h-4 w-4 rounded border-ink-300 text-brand-600 focus:ring-brand-500"
                            />
                          </Td>
                        )}

                        {/* Image */}
                        <Td>
                          <div className="grid h-10 w-10 place-items-center overflow-hidden rounded-xl border border-ink-200 bg-ink-50 shadow-sm">
                            {category.image ? (
                              <img
                                src={category.image}
                                alt=""
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <ImageIcon className="h-4 w-4 text-ink-300" />
                            )}
                          </div>
                        </Td>

                        {/* Category */}
                        <Td>
                          <div
                            className="flex items-center"
                            style={{
                              paddingLeft: `${Math.min(
                                category.depth ?? 0,
                                4,
                              ) * 18}px`,
                            }}
                          >
                            {category.depth > 0 && (
                              <div className="mr-2 flex items-center">
                                <span className="h-px w-3 bg-ink-300" />
                                <ChevronRight className="h-3 w-3 text-ink-300" />
                              </div>
                            )}

                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-semibold text-ink-900">
                                  {category.name}
                                </span>

                                {category.depth === 0 && (
                                  <span className="rounded-md bg-ink-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink-500">
                                    Main
                                  </span>
                                )}
                              </div>

                              <p className="mt-0.5 max-w-[280px] truncate text-xs text-ink-400">
                                /{category.slug}
                              </p>
                            </div>
                          </div>
                        </Td>

                        {/* Products */}
                        <Td numeric>
                          <span className="inline-flex min-w-10 items-center justify-center rounded-lg bg-ink-100 px-2 py-1 text-xs font-semibold text-ink-700">
                            {category.products_count ?? 0}
                          </span>
                        </Td>

                        {/* Status */}
                        <Td>
                          {editable ? (
                            <button
                              type="button"
                              onClick={() =>
                                toggleActive(category)
                              }
                              disabled={remove.isPending}
                              className="disabled:opacity-50"
                              title={
                                category.is_active
                                  ? 'Click to hide'
                                  : 'Click to activate'
                              }
                            >
                              <Badge
                                tone={
                                  category.is_active
                                    ? 'success'
                                    : 'neutral'
                                }
                              >
                                <span
                                  className={cx(
                                    'mr-1.5 inline-block h-1.5 w-1.5 rounded-full',
                                    category.is_active
                                      ? 'bg-success-600'
                                      : 'bg-ink-400',
                                  )}
                                />

                                {category.is_active
                                  ? 'Active'
                                  : 'Hidden'}
                              </Badge>
                            </button>
                          ) : (
                            <Badge
                              tone={
                                category.is_active
                                  ? 'success'
                                  : 'neutral'
                              }
                            >
                              {category.is_active
                                ? 'Active'
                                : 'Hidden'}
                            </Badge>
                          )}
                        </Td>

                        {/* Featured */}
                        <Td>
                          {editable ? (
                            <button
                              type="button"
                              onClick={() =>
                                toggleFeatured(category)
                              }
                              disabled={remove.isPending}
                              className={cx(
                                'inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium transition',
                                category.is_featured
                                  ? 'bg-warning-50 text-warning-700 hover:bg-warning-100'
                                  : 'text-ink-400 hover:bg-ink-100 hover:text-ink-700',
                              )}
                            >
                              <Star
                                className={cx(
                                  'h-3.5 w-3.5',
                                  category.is_featured &&
                                    'fill-current',
                                )}
                              />

                              {category.is_featured
                                ? 'Featured'
                                : 'Off'}
                            </button>
                          ) : category.is_featured ? (
                            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-warning-700">
                              <Star className="h-3.5 w-3.5 fill-current" />
                              Featured
                            </span>
                          ) : (
                            <span className="text-xs text-ink-400">
                              —
                            </span>
                          )}
                        </Td>

                        {/* Ordering */}
                        {editable && (
                          <Td>
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() =>
                                  move(category, -1)
                                }
                                disabled={
                                  siblingIndex <= 0 ||
                                  reorder.isPending
                                }
                                aria-label={`Move ${category.name} up`}
                                className="grid h-8 w-8 place-items-center rounded-lg border border-ink-200 bg-white text-ink-500 shadow-sm transition hover:border-ink-300 hover:bg-ink-50 hover:text-ink-900 disabled:cursor-not-allowed disabled:opacity-30"
                              >
                                <ArrowUp className="h-3.5 w-3.5" />
                              </button>

                              <button
                                type="button"
                                onClick={() =>
                                  move(category, 1)
                                }
                                disabled={
                                  siblingIndex >=
                                    siblings.length - 1 ||
                                  reorder.isPending
                                }
                                aria-label={`Move ${category.name} down`}
                                className="grid h-8 w-8 place-items-center rounded-lg border border-ink-200 bg-white text-ink-500 shadow-sm transition hover:border-ink-300 hover:bg-ink-50 hover:text-ink-900 disabled:cursor-not-allowed disabled:opacity-30"
                              >
                                <ArrowDown className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </Td>
                        )}

                        {/* Actions */}
                        <Td className="text-right">
                          {editable && (
                            <div className="flex items-center justify-end gap-1 opacity-70 transition group-hover:opacity-100">
                              <button
                                type="button"
                                onClick={() =>
                                  openForm({
                                    id: category.id,
                                    name: category.name,
                                    slug:
                                      category.slug ?? '',
                                    image:
                                      category.image ?? '',
                                    parent_id:
                                      category.parent_id ??
                                      '',
                                    description:
                                      category.description ??
                                      '',
                                    is_active:
                                      category.is_active,
                                    is_featured:
                                      category.is_featured,
                                  })
                                }
                                className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-brand-700 transition hover:bg-brand-50"
                              >
                                Edit
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  if (
                                    window.confirm(
                                      `Delete "${category.name}"?`,
                                    )
                                  ) {
                                    remove.mutate({
                                      method: 'delete',
                                      url: `/admin/categories/${category.id}`,
                                    })
                                  }
                                }}
                                className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-danger-700 transition hover:bg-danger-50"
                              >
                                Delete
                              </button>

                              <button
                                type="button"
                                className="grid h-8 w-8 place-items-center rounded-lg text-ink-400 hover:bg-ink-100 hover:text-ink-700"
                                aria-label="More actions"
                              >
                                <MoreHorizontal className="h-4 w-4" />
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

            {/* Footer */}
            {!query.isLoading && visible.length > 0 && (
              <div className="flex flex-col gap-2 border-t border-ink-100 bg-ink-50/50 px-4 py-3 text-xs text-ink-500 sm:flex-row sm:items-center sm:justify-between">
                <span>
                  Showing{' '}
                  <strong className="font-semibold text-ink-700">
                    {visible.length}
                  </strong>{' '}
                  of{' '}
                  <strong className="font-semibold text-ink-700">
                    {categories.length}
                  </strong>{' '}
                  categories
                </span>

                <span>
                  Use the arrows to reorder categories within
                  the same parent.
                </span>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}