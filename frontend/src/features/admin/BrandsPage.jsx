import { useState } from 'react'
import { Plus, Store } from 'lucide-react'
import { useList, useWrite } from './useResource'
import { useAuthStore } from '../../stores/authStore'
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  Field,
  Spinner,
  TableWrap,
  Td,
  Th,
} from '../../components/ui'

export default function BrandsPage() {
  const can = useAuthStore((state) => state.can)
  const query = useList('admin.brands', '/admin/brands')
  const write = useWrite('admin.brands', { onSuccess: () => setForm(null) })
  const [form, setForm] = useState(null)

  const brands = query.data?.data ?? []

  const submit = (event) => {
    event.preventDefault()

    const data = new FormData(event.currentTarget)
    const body = { name: data.get('name'), description: data.get('description') || null }

    if (form?.id) write.mutate({ method: 'put', url: `/admin/brands/${form.id}`, body })
    else write.mutate({ url: '/admin/brands', body })
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink-900">Brands</h1>
          <p className="mt-0.5 text-sm text-ink-500">Optional. Products can have no brand.</p>
        </div>

        {can('brands.manage') && (
          <Button onClick={() => setForm({ name: '', description: '' })}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            New brand
          </Button>
        )}
      </div>

      {form && (
        <Card>
          <CardHeader title={form.id ? 'Edit brand' : 'New brand'} />
          <form onSubmit={submit} className="grid gap-4 p-4 sm:grid-cols-2">
            <Field label="Name" name="name" required defaultValue={form.name} />
            <Field label="Description" name="description" defaultValue={form.description ?? ''} />

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
      ) : brands.length === 0 ? (
        <EmptyState icon={Store} title="No brands yet" />
      ) : (
        <TableWrap>
          <thead>
            <tr>
              <Th>Name</Th>
              <Th numeric>Products</Th>
              <Th>Status</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {brands.map((brand) => (
              <tr key={brand.id} className="hover:bg-ink-50">
                <Td>
                  <span className="font-medium text-ink-900">{brand.name}</span>
                  <span className="ml-2 text-xs text-ink-400">{brand.slug}</span>
                </Td>
                <Td numeric>{brand.products_count ?? 0}</Td>
                <Td>
                  <Badge tone={brand.is_active ? 'success' : 'neutral'}>
                    {brand.is_active ? 'Active' : 'Hidden'}
                  </Badge>
                </Td>
                <Td className="text-right">
                  {can('brands.manage') && (
                    <div className="flex justify-end gap-3">
                      <button
                        type="button"
                        onClick={() => setForm({ id: brand.id, name: brand.name, description: brand.description })}
                        className="text-sm font-medium text-brand-700 hover:underline"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (window.confirm(`Delete “${brand.name}”?`)) {
                            write.mutate({ method: 'delete', url: `/admin/brands/${brand.id}` })
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
