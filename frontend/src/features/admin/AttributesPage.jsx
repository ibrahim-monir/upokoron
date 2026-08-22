import { useState } from 'react'
import { Plus, Shapes, X } from 'lucide-react'
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
  Input,
  Select,
  Spinner,
} from '../../components/ui'

const emptyForm = { name: '', type: 'select', is_variant: true, values: [{ value: '', color_hex: '' }] }

export default function AttributesPage() {
  const can = useAuthStore((state) => state.can)
  const query = useList('admin.attributes', '/admin/attributes')
  const write = useWrite('admin.attributes', { onSuccess: () => setForm(null) })
  const [form, setForm] = useState(null)

  const attributes = query.data?.data ?? []

  const setValue = (index, patch) => {
    setForm((current) => ({
      ...current,
      values: current.values.map((value, i) => (i === index ? { ...value, ...patch } : value)),
    }))
  }

  const submit = (event) => {
    event.preventDefault()

    const body = {
      name: form.name,
      type: form.type,
      is_variant: form.is_variant,
      values: form.values
        .filter((value) => value.value.trim() !== '')
        .map((value) => ({
          id: value.id,
          value: value.value.trim(),
          color_hex: form.type === 'color' ? value.color_hex || null : null,
        })),
    }

    if (form.id) write.mutate({ method: 'put', url: `/admin/attributes/${form.id}`, body })
    else write.mutate({ url: '/admin/attributes', body })
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink-900">Attributes</h1>
          <p className="mt-0.5 text-sm text-ink-500">
            Variant attributes create a SKU per combination. Descriptive ones do not.
          </p>
        </div>

        {can('attributes.manage') && (
          <Button onClick={() => setForm(structuredClone(emptyForm))}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            New attribute
          </Button>
        )}
      </div>

      {form && (
        <Card>
          <CardHeader title={form.id ? 'Edit attribute' : 'New attribute'} />
          <form onSubmit={submit} className="flex flex-col gap-4 p-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field
                label="Name"
                required
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
              />

              <Field label="Type">
                {({ id }) => (
                  <Select
                    id={id}
                    value={form.type}
                    onChange={(event) => setForm({ ...form, type: event.target.value })}
                  >
                    <option value="select">Dropdown</option>
                    <option value="color">Colour swatch</option>
                    <option value="text">Text</option>
                  </Select>
                )}
              </Field>

              <label className="flex items-end gap-2 pb-2 text-sm text-ink-700">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-ink-300"
                  checked={form.is_variant}
                  onChange={(event) => setForm({ ...form, is_variant: event.target.checked })}
                />
                Creates variations
              </label>
            </div>

            <fieldset className="flex flex-col gap-2">
              <legend className="text-sm font-medium text-ink-800">Values</legend>

              {form.values.map((value, index) => (
                <div key={index} className="flex items-center gap-2">
                  <Input
                    value={value.value}
                    onChange={(event) => setValue(index, { value: event.target.value })}
                    placeholder="e.g. Red"
                    aria-label={`Value ${index + 1}`}
                  />

                  {form.type === 'color' && (
                    <input
                      type="color"
                      value={value.color_hex || '#000000'}
                      onChange={(event) => setValue(index, { color_hex: event.target.value })}
                      aria-label={`Colour for value ${index + 1}`}
                      className="h-10 w-14 shrink-0 rounded-lg border border-ink-300"
                    />
                  )}

                  <button
                    type="button"
                    onClick={() =>
                      setForm({ ...form, values: form.values.filter((_, i) => i !== index) })
                    }
                    aria-label={`Remove value ${index + 1}`}
                    className="shrink-0 rounded-lg p-2 text-ink-500 hover:bg-ink-100"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}

              <button
                type="button"
                onClick={() => setForm({ ...form, values: [...form.values, { value: '', color_hex: '' }] })}
                className="w-fit text-sm font-medium text-brand-800 hover:underline"
              >
                + Add another value
              </button>
            </fieldset>

            <div className="flex gap-2">
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
      ) : attributes.length === 0 ? (
        <EmptyState
          icon={Shapes}
          title="No attributes yet"
          description="Add Colour or Size to start selling variable products."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {attributes.map((attribute) => (
            <Card key={attribute.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-ink-900">{attribute.name}</p>
                  <div className="mt-1 flex gap-1.5">
                    <Badge tone="neutral">{attribute.type}</Badge>
                    {attribute.is_variant && <Badge tone="brand">Creates variations</Badge>}
                  </div>
                </div>

                {can('attributes.manage') && (
                  <button
                    type="button"
                    onClick={() =>
                      setForm({
                        id: attribute.id,
                        name: attribute.name,
                        type: attribute.type,
                        is_variant: attribute.is_variant,
                        values: attribute.values.length
                          ? attribute.values.map((v) => ({ id: v.id, value: v.value, color_hex: v.color_hex ?? '' }))
                          : [{ value: '', color_hex: '' }],
                      })
                    }
                    className="text-sm font-medium text-brand-800 hover:underline"
                  >
                    Edit
                  </button>
                )}
              </div>

              <div className="mt-3 flex flex-wrap gap-1.5">
                {attribute.values.map((value) => (
                  <span
                    key={value.id}
                    className="inline-flex items-center gap-1.5 rounded-full border border-ink-200 px-2 py-0.5 text-xs text-ink-700"
                  >
                    {value.color_hex && (
                      <span
                        className="h-3 w-3 rounded-full border border-ink-300"
                        style={{ backgroundColor: value.color_hex }}
                        aria-hidden="true"
                      />
                    )}
                    {value.value}
                  </span>
                ))}
                {attribute.values.length === 0 && <span className="text-xs text-ink-400">No values yet</span>}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
