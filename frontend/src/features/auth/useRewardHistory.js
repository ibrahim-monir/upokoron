import { useQuery } from '@tanstack/react-query'
import { get } from '../../lib/api'

/** The signed-in customer's own reward point history, newest first. */
export function useRewardHistory(page = 1) {
  return useQuery({
    queryKey: ['shop', 'rewards', 'history', page],
    queryFn: () => get('/shop/rewards/history', { params: { page } }),
  })
}
