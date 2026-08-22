import { useEffect, useMemo } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Layers } from 'lucide-react'
import { api, get } from '../../lib/api'
import { cx } from '../../lib/format'
import { Spinner } from '../../components/ui'

/**
 * Choosing what a variable product varies by.
 *
 * Without this the "Variable" option was a dead end: the form never sent an
 * `attributes` key, so saving always failed on "the attributes field is
 * required" -- an error about something the screen did not ask for.
 *
 * The combinations are previewed by the server rather than multiplied out
 * here. The naming and ordering of a variation must match what actually gets
 * created, and two implementations of a cartesian product will differ the
 * first time someone reorders an attribute.
 */
export function VariationBuilder({ value, onChange }) {
  const selection = value ?? {}

  const attributes = useQuery({
    queryKey: ['admin', 'attributes', 'options'],
    queryFn: () => get('/admin/attributes'),
    select: (response) => response.data,
    staleTime: 5 * 60 * 1000,
  })

  const preview = useMutation({
    mutationFn: async (attrs) => {
      const { data } = await api.post('/admin/products/preview-variations', { attributes: attrs })

      return data
    },
  })

  // Only attributes with at least one value chosen are sent; an attribute
  // with none would multiply the whole set by zero.
  const chosen = useMemo(
    () => Object.fromEntries(Object.entries(selection).filter(([, ids]) => ids.length > 0)),
    [selection],
  )

  const chosenKey = JSON.stringify(chosen)

  useEffect(() => {
    if (Object.keys(chosen).length === 0) return

    preview.mutate(chosen)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chosenKey])

  const toggle = (attributeId, valueId) => {
    const current = selection[attributeId] ?? []

    onChange({
      ...selection,
      [attributeId]: current.includes(valueId)
        ? current.filter((id) => id !== valueId)
        : [...current, valueId],
    })
  }

  if (attributes.isLoading) {
    return (
      <div className="grid place-items-center py-8">
        <Spinner />
      </div>
    )
  }

  const list = attributes.data ?? []

  if (list.length === 0) {
    return (
      <p className="text-sm text-ink-500">
        No attributes exist yet. Create one under Products → Attributes first — a variable product
        needs something to vary by, like colour or size.
      </p>
    )
  }

  const combinations = preview.data?.data ?? []

  return (
    <div className="flex flex-col gap-4">
      {list.map((attribute) => (
        <div key={attribute.id}>
          <p className="text-sm font-medium text-ink-800">{attribute.name}</p>

          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {(attribute.values ?? []).map((option) => {
              const active = (selection[attribute.id] ?? []).includes(option.id)

              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => toggle(attribute.id, option.id)}
                  aria-pressed={active}
                  className={cx(
                    'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors',
                    active
                      ? 'border-brand-600 bg-brand-50 font-medium text-brand-800'
                      : 'border-ink-200 text-ink-700 hover:border-brand-300',
                  )}
                >
                  {option.color_hex && (
                    <span
                      className="h-3 w-3 rounded-full ring-1 ring-ink-200"
                      style={{ backgroundColor: option.color_hex }}
                      aria-hidden="true"
                    />
                  )}
                  {option.value}
                </button>
              )
            })}
          </div>
        </div>
      ))}

      {/*
        The count is the point: picking 3 colours and 4 sizes quietly means
        twelve SKUs to stock and price, and people routinely do not notice
        until the stock screen is full of them.
      */}
      <div className="rounded-lg bg-ink-50 p-3">
        {Object.keys(chosen).length === 0 ? (
          <p className="text-sm text-ink-500">
            Pick the values this product comes in. One variation is created for each combination.
          </p>
        ) : preview.isPending ? (
          <p className="flex items-center gap-2 text-sm text-ink-500">
            <Spinner className="h-4 w-4" /> Working out the combinations…
          </p>
        ) : (
          <>
            <p className="flex items-center gap-2 text-sm font-medium text-ink-900">
              <Layers className="h-4 w-4 text-brand-800" aria-hidden="true" />
              {combinations.length} variation{combinations.length === 1 ? '' : 's'} will be created
            </p>

            <div className="mt-2 flex flex-wrap gap-1.5">
              {combinations.slice(0, 24).map((combination) => (
                <span
                  key={combination.key}
                  className="rounded bg-white px-2 py-0.5 text-xs text-ink-700 ring-1 ring-ink-200"
                >
                  {combination.name}
                </span>
              ))}

              {combinations.length > 24 && (
                <span className="px-1 text-xs text-ink-500">
                  and {combinations.length - 24} more
                </span>
              )}
            </div>

            <p className="mt-2 text-xs text-ink-500">
              Each one starts at the price above. Set individual prices and stock afterwards, from
              the product's variation list.
            </p>
          </>
        )}
      </div>
    </div>
  )
}
