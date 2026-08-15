import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { MapPin, Pencil, Plus, Search, Trash2, Truck, X } from 'lucide-react'
import { api, get } from '../../lib/api'
import { cx, money } from '../../lib/format'
import {
  Badge,
  Button,
  ErrorState,
  Field,
  Input,
  Spinner,
  useToast,
} from '../../components/ui'
import { useAuthStore } from '../../stores/authStore'
import { DistrictSelect, useDistricts } from '../../components/DistrictSelect'

/**
 * Where the shop delivers, and what it charges.
 *
 * The screen is built around the two things that actually go wrong. A
 * district can end up in no zone, so the default zone is called out on every
 * screen it appears on and cannot be deleted. And a district can be listed in
 * the wrong zone, which looks fine here and only shows up as a customer being
 * charged the wrong amount -- so there is an address tester at the top that
 * answers "where does Gazipur go?" against the same service checkout uses.
 */

function useZones() {
  return useQuery({
    queryKey: ['admin', 'shipping', 'zones'],
    queryFn: () => get('/admin/shipping/zones'),
    select: (response) => response.data,
  })
}

/** Try an address against the live rules. */
function AddressTester() {
  const [district, setDistrict] = useState('')
  const [city, setCity] = useState('')

  const test = useMutation({
    mutationFn: async () => {
      const { data } = await api.post('/admin/shipping/test', {
        district: district.trim(),
        city: city.trim() || null,
      })

      return data.data
    },
  })

  const result = test.data

  return (
    <section className="rounded-card border border-ink-200 bg-white p-4">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-ink-900">
        <Search className="h-4 w-4 text-brand-600" aria-hidden="true" />
        Try an address
      </h2>
      <p className="mt-0.5 text-sm text-ink-500">
        Check which zone an address falls in before a customer finds out for you.
      </p>

      <form
        className="mt-3 flex flex-wrap gap-2"
        onSubmit={(event) => {
          event.preventDefault()

          if (district.trim()) test.mutate()
        }}
      >
        <Input
          value={district}
          onChange={(event) => setDistrict(event.target.value)}
          placeholder="District (Gazipur)"
          aria-label="District"
          className="min-w-40 flex-1"
        />
        <Input
          value={city}
          onChange={(event) => setCity(event.target.value)}
          placeholder="City (optional)"
          aria-label="City"
          className="min-w-40 flex-1"
        />
        <Button type="submit" loading={test.isPending} disabled={!district.trim()}>
          Check
        </Button>
      </form>

      {test.isError && (
        <p className="mt-2 text-sm text-danger-700">{test.error?.message ?? 'Could not check that.'}</p>
      )}

      {result && (
        <div
          className={cx(
            'mt-3 rounded-lg border p-3 text-sm',
            result.zone.is_fallback ? 'border-warning-500/40 bg-warning-50' : 'border-ink-200 bg-ink-50',
          )}
        >
          <p className="font-medium text-ink-900">
            {result.zone.name}
            <span className="ml-2 font-normal text-ink-500">matched by {result.matched_by}</span>
          </p>

          {/*
            Falling through to the default is usually the sign of a missing
            area rather than a deliberate catch-all, so it says so instead of
            quietly reporting a zone.
          */}
          {result.zone.is_fallback && (
            <p className="mt-1 text-warning-700">
              No listed area covers this address, so it fell through to the default zone. Add it to a
              zone if it should cost something else.
            </p>
          )}

          <ul className="mt-2 flex flex-col gap-1">
            {result.options.map((option) => (
              <li key={option.id} className="tabular flex justify-between gap-3 text-ink-700">
                <span>
                  {option.name}
                  {option.estimate ? ` · ${option.estimate}` : ''}
                </span>
                <span className="font-medium text-ink-900">
                  {option.is_free ? 'Free' : money(option.charge)}
                </span>
              </li>
            ))}
          </ul>

          <p className="mt-2 text-xs text-ink-500">On a {money(result.subtotal)} order.</p>
        </div>
      )}
    </section>
  )
}

/** The districts and cities a zone covers, edited as a set. */
function AreaEditor({ zone, allZones, onClose }) {
  const toast = useToast()
  const queryClient = useQueryClient()
  const districts = useDistricts()
  const [areas, setAreas] = useState(zone.areas.map((area) => ({ ...area })))
  const [district, setDistrict] = useState('')
  const [city, setCity] = useState('')

  // Whole-district coverage already claimed by a DIFFERENT zone, keyed by
  // lowercase district name -> the zone name that has it. Shown as a warning
  // rather than blocked outright, since the matcher's "most specific area
  // wins" rule means an overlap is occasionally deliberate (a city-level
  // override sitting inside a district another zone already lists).
  const coveredElsewhere = new Map()

  for (const other of allZones ?? []) {
    if (other.id === zone.id) continue

    for (const area of other.areas) {
      if (!area.city) coveredElsewhere.set(area.district.toLowerCase(), other.name)
    }
  }

  const selectedWhole = new Set(
    areas.filter((area) => !area.city).map((area) => area.district.toLowerCase()),
  )

  const toggleDistrict = (name) => {
    const key = name.toLowerCase()

    if (selectedWhole.has(key)) {
      setAreas(areas.filter((area) => !(area.city == null && area.district.toLowerCase() === key)))
    } else {
      setAreas([...areas, { district: name, city: null }])
    }
  }

  const selectAllRemaining = () => {
    const divisions = districts.data?.divisions ?? {}
    const toAdd = Object.values(divisions)
      .flat()
      .filter((name) => !selectedWhole.has(name.toLowerCase()) && !coveredElsewhere.has(name.toLowerCase()))
      .map((name) => ({ district: name, city: null }))

    setAreas([...areas, ...toAdd])
  }

  const save = useMutation({
    mutationFn: async () => {
      const { data } = await api.put(`/admin/shipping/zones/${zone.id}/areas`, {
        areas: areas.map((area) => ({ district: area.district, city: area.city || null })),
      })

      return data
    },
    onSuccess() {
      toast.success('Areas updated.')
      queryClient.invalidateQueries({ queryKey: ['admin', 'shipping'] })
      onClose()
    },
    onError(error) {
      toast.error(error?.message ?? 'Could not save the areas.')
    },
  })

  const add = () => {
    const name = district.trim()

    if (!name) return

    const duplicate = areas.some(
      (area) =>
        area.district.toLowerCase() === name.toLowerCase() &&
        (area.city ?? '').toLowerCase() === city.trim().toLowerCase(),
    )

    if (duplicate) {
      toast.error('That area is already listed here.')
      return
    }

    setAreas([...areas, { district: name, city: city.trim() || null }])
    setDistrict('')
    setCity('')
  }

  return (
    <div className="rounded-lg border border-ink-200 bg-ink-50 p-3">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-sm font-semibold text-ink-900">Areas in {zone.name}</h4>
        <button type="button" onClick={onClose} aria-label="Close" className="text-ink-500 hover:text-ink-800">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-ink-500">Pick districts</p>
        <Button type="button" variant="secondary" size="sm" onClick={selectAllRemaining}>
          Select all remaining
        </Button>
      </div>

      <div className="mt-1.5 max-h-56 overflow-y-auto rounded-lg border border-ink-200 bg-white p-2.5">
        {districts.isLoading ? (
          <Spinner />
        ) : (
          Object.entries(districts.data?.divisions ?? {}).map(([division, names]) => (
            <div key={division} className="mb-2 last:mb-0">
              <p className="mb-1 text-xs font-semibold text-ink-500">{division} division</p>
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                {names.map((name) => {
                  const key = name.toLowerCase()
                  const claimedBy = coveredElsewhere.get(key)

                  return (
                    <label
                      key={name}
                      className="flex items-center gap-1.5 text-sm text-ink-800"
                      title={claimedBy ? `Also listed in ${claimedBy}` : undefined}
                    >
                      <input
                        type="checkbox"
                        checked={selectedWhole.has(key)}
                        onChange={() => toggleDistrict(name)}
                        className="h-4 w-4 rounded border-ink-300 text-brand-600"
                      />
                      {name}
                      {claimedBy && <span className="text-xs text-warning-700">· also in {claimedBy}</span>}
                    </label>
                  )
                })}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {areas.length === 0 ? (
          <p className="text-sm text-ink-500">
            No areas listed. {zone.is_fallback
              ? 'That is fine for the default zone — it covers everything not listed elsewhere.'
              : 'Nothing will be delivered under this zone until you add one.'}
          </p>
        ) : (
          areas.map((area, index) => (
            <span
              key={`${area.district}-${area.city ?? ''}`}
              className="inline-flex items-center gap-1.5 rounded-full border border-ink-200 bg-white py-1 pl-3 pr-1.5 text-sm text-ink-800"
            >
              {area.city ? `${area.city}, ${area.district}` : area.district}
              {!area.city && <span className="text-xs text-ink-400">(whole district)</span>}
              <button
                type="button"
                onClick={() => setAreas(areas.filter((_, i) => i !== index))}
                aria-label={`Remove ${area.district}`}
                className="grid h-5 w-5 place-items-center rounded-full text-ink-400 hover:bg-ink-100 hover:text-danger-700"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))
        )}
      </div>

      <p className="mt-3 text-xs font-medium uppercase tracking-wide text-ink-500">
        Or name one city inside a district
      </p>

      <div className="mt-1.5 flex flex-wrap gap-2">
        {/*
          A zone may only name a real district. Typed free, a misspelling
          creates an area that matches no address ever entered, and the zone
          silently covers nothing.
        */}
        <DistrictSelect
          value={district}
          onChange={(event) => setDistrict(event.target.value)}
          aria-label="District"
          className="min-w-36 flex-1"
        />
        <Input
          value={city}
          onChange={(event) => setCity(event.target.value)}
          placeholder="City (optional)"
          aria-label="City"
          className="min-w-36 flex-1"
        />
        <Button type="button" variant="secondary" onClick={add} disabled={!district.trim()}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add
        </Button>
      </div>

      <p className="mt-2 text-xs text-ink-500">
        Leave the city blank to cover a whole district. A row naming a city wins over one that does
        not, so Dhaka city can be charged differently from the rest of Dhaka district.
      </p>

      <div className="mt-3 flex gap-2">
        <Button onClick={() => save.mutate()} loading={save.isPending}>
          Save areas
        </Button>
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </div>
  )
}

/** One delivery option and its charge. */
function RateEditor({ zone, rate, onClose }) {
  const toast = useToast()
  const queryClient = useQueryClient()

  const [form, setForm] = useState({
    name: rate?.name ?? 'Standard delivery',
    base_charge: rate?.base_charge ?? '60.00',
    free_above_subtotal: rate?.free_above_subtotal ?? '',
    min_days: rate?.min_days ?? '',
    max_days: rate?.max_days ?? '',
    supports_cod: rate?.supports_cod ?? true,
  })

  const set = (key, value) => setForm((previous) => ({ ...previous, [key]: value }))

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form.name,
        base_charge: Number(form.base_charge),
        free_above_subtotal: form.free_above_subtotal === '' ? null : Number(form.free_above_subtotal),
        min_days: form.min_days === '' ? null : Number(form.min_days),
        max_days: form.max_days === '' ? null : Number(form.max_days),
        supports_cod: form.supports_cod,
      }

      const { data } = rate
        ? await api.put(`/admin/shipping/zones/${zone.id}/rates/${rate.id}`, payload)
        : await api.post(`/admin/shipping/zones/${zone.id}/rates`, payload)

      return data
    },
    onSuccess() {
      toast.success(rate ? 'Delivery option updated.' : 'Delivery option added.')
      queryClient.invalidateQueries({ queryKey: ['admin', 'shipping'] })
      onClose()
    },
    onError(error) {
      toast.error(error?.message ?? 'Could not save that.')
    },
  })

  return (
    <div className="rounded-lg border border-ink-200 bg-ink-50 p-3">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-sm font-semibold text-ink-900">
          {rate ? 'Edit delivery option' : 'New delivery option'}
        </h4>
        <button type="button" onClick={onClose} aria-label="Close" className="text-ink-500 hover:text-ink-800">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Field
          className="sm:col-span-2"
          label="Name"
          value={form.name}
          onChange={(event) => set('name', event.target.value)}
        />

        <Field
          label="Charge"
          type="number"
          step="0.01"
          min="0"
          value={form.base_charge}
          onChange={(event) => set('base_charge', event.target.value)}
        />

        <Field
          label="Free above"
          type="number"
          step="0.01"
          min="0"
          placeholder="Leave blank for never"
          hint="Measured on the order before delivery is added."
          value={form.free_above_subtotal}
          onChange={(event) => set('free_above_subtotal', event.target.value)}
        />

        <Field
          label="Fastest (days)"
          type="number"
          min="0"
          value={form.min_days}
          onChange={(event) => set('min_days', event.target.value)}
        />

        <Field
          label="Slowest (days)"
          type="number"
          min="0"
          value={form.max_days}
          onChange={(event) => set('max_days', event.target.value)}
        />
      </div>

      <label className="mt-3 flex items-center gap-2 text-sm text-ink-800">
        <input
          type="checkbox"
          checked={form.supports_cod}
          onChange={(event) => set('supports_cod', event.target.checked)}
          className="h-4 w-4 rounded border-ink-300 text-brand-600"
        />
        The courier collects cash on delivery here
      </label>

      <p className="mt-1 text-xs text-ink-500">
        Turn this off where your courier will not collect cash — customers there will not be offered
        cash on delivery at checkout.
      </p>

      <div className="mt-3 flex gap-2">
        <Button onClick={() => save.mutate()} loading={save.isPending}>
          Save
        </Button>
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </div>
  )
}

function ZoneCard({ zone, allZones }) {
  const toast = useToast()
  const queryClient = useQueryClient()
  const can = useAuthStore((state) => state.can)

  const [editing, setEditing] = useState(null)

  const removeRate = useMutation({
    mutationFn: (rateId) => api.delete(`/admin/shipping/zones/${zone.id}/rates/${rateId}`),
    onSuccess() {
      toast.success('Delivery option removed.')
      queryClient.invalidateQueries({ queryKey: ['admin', 'shipping'] })
    },
    onError(error) {
      toast.error(error?.message ?? 'Could not remove that.')
    },
  })

  const makeFallback = useMutation({
    mutationFn: () => api.put(`/admin/shipping/zones/${zone.id}`, { is_fallback: true }),
    onSuccess() {
      toast.success(`${zone.name} is now the default zone.`)
      queryClient.invalidateQueries({ queryKey: ['admin', 'shipping'] })
    },
    onError(error) {
      toast.error(error?.message ?? 'Could not set that as the default.')
    },
  })

  const editable = can('shipping.manage')

  return (
    <section className="rounded-card border border-ink-200 bg-white">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-ink-100 p-4">
        <div className="min-w-0">
          <h3 className="flex flex-wrap items-center gap-2 font-semibold text-ink-900">
            {zone.name}
            {zone.is_fallback && <Badge tone="brand">Default</Badge>}
            {!zone.is_active && <Badge tone="neutral">Off</Badge>}
          </h3>
          {zone.description && <p className="mt-0.5 text-sm text-ink-500">{zone.description}</p>}
        </div>

        {editable && (
          <div className="flex shrink-0 gap-2">
            {!zone.is_fallback && (
              <Button
                variant="secondary"
                size="sm"
                loading={makeFallback.isPending}
                onClick={() => {
                  if (
                    window.confirm(
                      `Make ${zone.name} the default zone? It will cover every address not listed in another zone, and no other zone will be the default.`,
                    )
                  ) {
                    makeFallback.mutate()
                  }
                }}
              >
                Make default
              </Button>
            )}

            <Button variant="secondary" size="sm" onClick={() => setEditing({ kind: 'areas' })}>
              <MapPin className="h-4 w-4" aria-hidden="true" />
              Areas ({zone.areas.length})
            </Button>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3 p-4">
        {editing?.kind === 'areas' ? (
          <AreaEditor zone={zone} allZones={allZones} onClose={() => setEditing(null)} />
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {zone.areas.length === 0 ? (
              <p className="text-sm text-ink-500">
                {zone.is_fallback
                  ? 'Covers every address not listed in another zone.'
                  : 'No areas yet — nothing is delivered under this zone.'}
              </p>
            ) : (
              zone.areas.map((area) => (
                <span
                  key={area.id}
                  className="rounded-full bg-ink-100 px-2.5 py-0.5 text-xs text-ink-700"
                >
                  {area.city ? `${area.city}, ${area.district}` : area.district}
                </span>
              ))
            )}
          </div>
        )}

        <ul className="flex flex-col gap-2">
          {zone.rates.map((rate) =>
            editing?.kind === 'rate' && editing.id === rate.id ? (
              <li key={rate.id}>
                <RateEditor zone={zone} rate={rate} onClose={() => setEditing(null)} />
              </li>
            ) : (
              <li
                key={rate.id}
                className="flex flex-wrap items-center gap-3 rounded-lg border border-ink-100 px-3 py-2"
              >
                <Truck className="h-4 w-4 shrink-0 text-ink-400" aria-hidden="true" />

                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ink-900">
                    {rate.name}
                    {!rate.is_active && <span className="ml-2 text-xs text-ink-500">(off)</span>}
                  </p>
                  <p className="text-xs text-ink-500">
                    {rate.estimate ?? 'No estimate'}
                    {rate.free_above_subtotal
                      ? ` · free above ${money(rate.free_above_subtotal)}`
                      : ''}
                    {!rate.supports_cod ? ' · no cash on delivery' : ''}
                  </p>
                </div>

                <span className="tabular shrink-0 font-semibold text-ink-900">
                  {money(rate.base_charge)}
                </span>

                {editable && (
                  <div className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      onClick={() => setEditing({ kind: 'rate', id: rate.id })}
                      aria-label={`Edit ${rate.name}`}
                      className="grid h-7 w-7 place-items-center rounded text-ink-500 hover:bg-ink-100 hover:text-ink-800"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm(`Remove “${rate.name}” from ${zone.name}?`)) {
                          removeRate.mutate(rate.id)
                        }
                      }}
                      aria-label={`Remove ${rate.name}`}
                      className="grid h-7 w-7 place-items-center rounded text-ink-500 hover:bg-ink-100 hover:text-danger-700"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </li>
            ),
          )}

          {editing?.kind === 'rate' && editing.id === null && (
            <li>
              <RateEditor zone={zone} rate={null} onClose={() => setEditing(null)} />
            </li>
          )}
        </ul>

        {editable && editing === null && (
          <Button
            variant="secondary"
            size="sm"
            className="w-fit"
            onClick={() => setEditing({ kind: 'rate', id: null })}
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add delivery option
          </Button>
        )}
      </div>
    </section>
  )
}

export default function ShippingZonesPage() {
  const zones = useZones()
  const can = useAuthStore((state) => state.can)
  const toast = useToast()
  const queryClient = useQueryClient()
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')

  const create = useMutation({
    mutationFn: async () => {
      const { data } = await api.post('/admin/shipping/zones', { name: name.trim() })

      return data
    },
    onSuccess() {
      toast.success('Zone added. Give it some areas and a charge.')
      setName('')
      setAdding(false)
      queryClient.invalidateQueries({ queryKey: ['admin', 'shipping'] })
    },
    onError(error) {
      toast.error(error?.message ?? 'Could not add that zone.')
    },
  })

  if (zones.isLoading) {
    return (
      <div className="grid place-items-center py-24">
        <Spinner />
      </div>
    )
  }

  if (zones.isError) return <ErrorState error={zones.error} onRetry={zones.refetch} />

  const list = zones.data ?? []

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink-900">Delivery zones</h1>
          <p className="mt-0.5 text-sm text-ink-500">
            What delivery costs, by where the order is going.
          </p>
        </div>

        {can('shipping.manage') && !adding && (
          <Button variant="secondary" onClick={() => setAdding(true)}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            New zone
          </Button>
        )}
      </div>

      {adding && (
        <form
          className="flex flex-wrap gap-2 rounded-card border border-ink-200 bg-white p-4"
          onSubmit={(event) => {
            event.preventDefault()

            if (name.trim()) create.mutate()
          }}
        >
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Zone name (Chattogram division)"
            aria-label="Zone name"
            className="min-w-48 flex-1"
            autoFocus
          />
          <Button type="submit" loading={create.isPending} disabled={!name.trim()}>
            Add zone
          </Button>
          <Button type="button" variant="secondary" onClick={() => setAdding(false)}>
            Cancel
          </Button>
        </form>
      )}

      <AddressTester />

      {list.map((zone) => (
        <ZoneCard key={zone.id} zone={zone} allZones={list} />
      ))}
    </div>
  )
}
