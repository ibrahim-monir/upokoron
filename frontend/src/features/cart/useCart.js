import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, get } from '../../lib/api'

/**
 * The basket lives on the server, so it is server state, not client state.
 *
 * Zustand holds nothing here on purpose. Stock is held against a real
 * reservation the moment something is added, and a browser-side copy of the
 * cart would be a second version of that truth -- one that survives a
 * refresh, disagrees with what is actually reserved, and shows a total the
 * server would not honour.
 *
 * Every cart endpoint answers with the WHOLE recalculated basket, so each
 * mutation writes the response straight into the cache. No refetch, no
 * flicker, and the totals on screen are always the ones the server just
 * worked out.
 */
const CART_KEY = ['shop', 'cart']

export function useCart() {
  return useQuery({
    queryKey: CART_KEY,
    queryFn: () => get('/shop/cart'),
    select: (response) => response.data,
    // The cart is small and correctness matters more than saving a request:
    // stock can run out while the tab sits open.
    staleTime: 0,
  })
}

/** Item count for the header badge, without making the header care how carts work. */
export function useCartCount() {
  const { data } = useCart()

  return data?.item_count ?? 0
}

function useCartMutation(mutationFn) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn,
    onSuccess(response) {
      queryClient.setQueryData(CART_KEY, response)
    },
  })
}

export function useAddToCart() {
  return useCartMutation(async ({ variationId, quantity = 1 }) => {
    const { data } = await api.post('/shop/cart/items', {
      product_variation_id: variationId,
      quantity,
    })

    return data
  })
}

export function useUpdateCartItem() {
  return useCartMutation(async ({ itemId, quantity }) => {
    const { data } = await api.put(`/shop/cart/items/${itemId}`, { quantity })

    return data
  })
}

export function useRemoveCartItem() {
  return useCartMutation(async (itemId) => {
    const { data } = await api.delete(`/shop/cart/items/${itemId}`)

    return data
  })
}

export function useClearCart() {
  return useCartMutation(async () => {
    const { data } = await api.delete('/shop/cart')

    return data
  })
}

export function useApplyCoupon() {
  return useCartMutation(async (code) => {
    const { data } = await api.post('/shop/cart/coupon', { code })

    return data
  })
}

export function useRemoveCoupon() {
  return useCartMutation(async () => {
    const { data } = await api.delete('/shop/cart/coupon')

    return data
  })
}

export function useRedeemRewardPoints() {
  return useCartMutation(async (points) => {
    const { data } = await api.post('/shop/cart/reward-points', { points })

    return data
  })
}

export function useRemoveRewardPoints() {
  return useCartMutation(async () => {
    const { data } = await api.delete('/shop/cart/reward-points')

    return data
  })
}

export function useShippingZones() {
  return useQuery({
    queryKey: ['shop', 'shipping-zones'],
    queryFn: () => get('/shop/shipping/zones'),
    select: (response) => response.data,
    staleTime: 10 * 60 * 1000,
  })
}
