import { useState } from 'react'
import { Image as ImageIcon, Plus, Shapes } from 'lucide-react'
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
  Select,
  Spinner,
  TableWrap,
  Td,
  Th,
} from '../../components/ui'

export default function CategoriesPage() {
  const can = useAuthStore((state) => state.can)
  const query = useList('admin.categories', '/admin/categories')
  const write = useWrite('admin.categories', { onSuccess: () => setForm(null) })
  const [form, setForm] = useState(null)
  const [pickingImage, setPickingImage] = useState(false)

  const categories = query.data?.data ?? []

  const submit = (event) => {
    event.preventDefault()

    const data = new FormData(event.currentTarget)
    const body = {
      name: data.get('name'),
      slug: data.get('slug') || null,
      image: form.image || null,
      parent_id: data.get('parent_id') || null,
      is_active: true,
    }

    if (form?.id) {
      write.mutate({ method: 'put', url: `/admin/categories/${form.id}`, body })
    } else {
      write.mutate({ url: '/admin/categories', body })
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink-900">Categories</h1>
          <p className="mt-0.5 text-sm text-ink-500">
            Up to four levels deep. A category with products cannot be deleted.
          </p>
        </div>

        {can('categories.manage') && (
          <Button onClick={() => setForm({ name: '', slug: '', image: '', parent_id: '' })}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            New category
          </Button>
        )}
      </div>

      {form && (
        <Card>
          <MediaPicker
            open={pickingImage}
            onClose={() => setPickingImage(false)}
            onSelect={(item) => {
              setForm((current) => ({ ...current, image: item.url }))
              setPickingImage(false)
            }}
            folder="categories"
            title="Choose an image"
          />

          <CardHeader title={form.id ? 'Edit category' : 'New category'} />
          <form onSubmit={submit} className="grid gap-4 p-4 sm:grid-cols-2">
            <Field label="Name" name="name" required defaultValue={form.name} />

            <Field
              label="Slug"
              name="slug"
              defaultValue={form.slug}
              placeholder="left blank, made from the name"
              hint="Changing this on a live category breaks links people have saved."
            />

            <Field label="Image" hint="Shown in the category menu and on the storefront.">
              {() => (
                <div className="flex items-center gap-3">
                  <span className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-lg border border-ink-200 bg-ink-50">
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

            <Field label="Parent category">
              {({ id }) => (
                <Select id={id} name="parent_id" defaultValue={form.parent_id ?? ''}>
                  <option value="">Top level</option>
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

            <div className="flex gap-2 sm:col-span-2">
              <Button type="submit" loading={write.isPending}>
                {form.id ? 'Save' : 'Create'}
              </Button>
              <Button variant="secondary" onClick={() => setForm(null)}>
                Cancel
              </Button>
            </div>
          </form>
        </Card>
      )}

      {query.isError && <ErrorState error={query.error} onRetry={query.refetch} />}

      {query.isLoading ? (
        <div className="grid place-items-center py-16">
          <Spinner />
        </div>
      ) : categories.length === 0 ? (
        <EmptyState icon={Shapes} title="No categories yet" description="Every product needs one." />
      ) : (
        <TableWrap>
          <thead>
            <tr>
              <Th>Name</Th>
              <Th>Parent</Th>
              <Th numeric>Products</Th>
              <Th>Status</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {categories.map((category) => (
              <tr key={category.id} className="hover:bg-ink-50">
                <Td>
                  <span style={{ paddingLeft: `${category.depth * 16}px` }} className="font-medium text-ink-900">
                    {category.name}
                  </span>
                  <span className="ml-2 text-xs text-ink-400">{category.slug}</span>
                </Td>
                <Td>{category.parent ?? '—'}</Td>
                <Td numeric>{category.products_count ?? 0}</Td>
                <Td>
                  <Badge tone={category.is_active ? 'success' : 'neutral'}>
                    {category.is_active ? 'Active' : 'Hidden'}
                  </Badge>
                </Td>
                <Td className="text-right">
                  {can('categories.manage') && (
                    <div className="flex justify-end gap-3">
                      <button
                        type="button"
                        onClick={() =>
                          setForm({
                            id: category.id,
                            name: category.name,
                            slug: category.slug ?? '',
                            image: category.image ?? '',
                            parent_id: category.parent_id ?? '',
                          })
                        }
                        className="text-sm font-medium text-brand-700 hover:underline"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (window.confirm(`Delete “${category.name}”?`)) {
                            write.mutate({ method: 'delete', url: `/admin/categories/${category.id}` })
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
            ))}
          </tbody>
        </TableWrap>
      )}
    </div>
  )
}
