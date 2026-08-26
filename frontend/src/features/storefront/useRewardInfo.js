import { useQuery } from '@tanstack/react-query'

import { get } from '../../lib/api'

/**
 * The rewards programme's terms, as the shop currently has them set.
 *
 * One definition shared by both readers -- the page that spells the terms
 * out and the top bar that decides whether to link to it -- so the two can
 * never disagree about how fresh they are, which is what two copies of the
 * same query key with two different stale times would eventually do.
 *
 * The short stale time is the point of it: every figure behind this comes
 * from the admin rewards screen, and a shopper reading a rate the owner
 * changed an hour ago is being quoted a price checkout will not honour.
 */
export function useRewardInfo() {
  return useQuery({
    queryKey: ['shop', 'rewards'],
    queryFn: () => get('/shop/rewards'),
    staleTime: 60_000,
    refetchOnWindowFocus: true,
    select: (response) => response.data,
  })
}
