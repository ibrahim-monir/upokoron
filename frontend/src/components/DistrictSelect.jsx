import { forwardRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { get } from '../lib/api'
import { cx } from '../lib/format'

/**
 * The districts of Bangladesh, fetched rather than hardcoded.
 *
 * One list, served by the API, so the dropdown and the validation behind it
 * cannot drift apart -- and so a delivery zone can never name a district that
 * no address form will produce.
 */
export function useDistricts() {
  return useQuery({
    queryKey: ['shop', 'districts'],
    queryFn: () => get('/shop/districts'),
    select: (response) => response.data,
    // It changes when the country redraws its map. Fetch once and keep it.
    staleTime: Infinity,
    gcTime: Infinity,
  })
}

/**
 * Grouped by division, because 64 flat options is a scroll and nobody knows
 * where their district sits alphabetically among all of them.
 */
export const DistrictSelect = forwardRef(function DistrictSelect(
  { id, className, invalid, placeholder = 'Choose a district', ...props },
  ref,
) {
  const districts = useDistricts()
  const divisions = districts.data?.divisions ?? {}

  return (
    <select
      ref={ref}
      id={id}
      disabled={districts.isLoading || props.disabled}
      aria-invalid={invalid ? 'true' : undefined}
      className={cx(
        'h-10 rounded-lg border bg-white px-3 text-sm text-ink-900 transition-colors',
        'disabled:bg-ink-100 disabled:text-ink-500',
        invalid ? 'border-danger-500' : 'border-ink-300 hover:border-ink-400',
        className,
      )}
      {...props}
    >
      <option value="">{districts.isLoading ? 'Loading…' : placeholder}</option>

      {Object.entries(divisions).map(([division, names]) => (
        <optgroup key={division} label={`${division} division`}>
          {names.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  )
})
