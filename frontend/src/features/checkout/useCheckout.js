import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, get } from '../../lib/api'

/**
 * Checkout data.
 *
 * One request brings the basket, the saved addresses and the payment methods
 * the order actually qualifies for -- the server has already dropped any
 * method whose order limits this basket falls outside, so the screen never
 * offers a choice that would be refused after everything else is filled in.
 */
export function useCheckout() {
  return useQuery({
    queryKey: ['shop', 'checkout'],
    queryFn: () => get('/shop/checkout'),
    select: (response) => response.data,
    staleTime: 0,
  })
}

/**
 * Delivery options for an address.
 *
 * Priced against the server's copy of the cart, so the charge shown here is
 * the charge the order is placed with. Nothing about the basket is sent.
 */
export function useShippingOptions() {
  return useMutation({
    mutationFn: async ({ district, city, cod = false }) => {
      const { data } = await api.post('/shop/checkout/shipping-options', { district, city, cod })

      return data.data
    },
  })
}

export function usePlaceOrder() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (payload) => {
      const { data } = await api.post('/shop/checkout', payload)

      return data.data
    },
    onSuccess() {
      // The basket became the order. Anything still holding the old cart in
      // memory -- the header badge above all -- must stop showing it.
      queryClient.invalidateQueries({ queryKey: ['shop', 'cart'] })
      queryClient.invalidateQueries({ queryKey: ['shop', 'checkout'] })
      queryClient.invalidateQueries({ queryKey: ['shop', 'orders'] })
    },
  })
}

export function useMyOrders() {
  return useQuery({
    queryKey: ['shop', 'orders'],
    queryFn: () => get('/shop/orders'),
  })
}

/**
 * One order.
 *
 * `phone` is how a guest proves the order is theirs. A signed-in customer
 * needs nothing -- the API matches on their own customer record first and
 * only falls back to the phone check for everyone else.
 */
export function useOrder(number, phone) {
  return useQuery({
    queryKey: ['shop', 'orders', number, phone ?? null],
    queryFn: () => get(`/shop/orders/${number}`, { params: phone ? { phone } : undefined }),
    select: (response) => response.data,
    enabled: Boolean(number),
    retry: false,
  })
}

/**
 * "I have paid -- here is the bKash transaction id."
 *
 * Writes a note on the order for staff to check against the statement. It
 * does NOT mark the order paid: the shop confirms the money itself, and a
 * storefront that could declare its own orders settled would be an invitation.
 */
export function useSubmitPaymentReference() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ number, reference, phone }) => {
      const { data } = await api.post(`/shop/orders/${number}/payment-reference`, {
        payment_reference: reference,
        phone: phone || undefined,
      })

      return data.data
    },
    onSuccess() {
      // Prefix match: this covers both the list and the single order, whose
      // key carries the guest's phone on the end.
      queryClient.invalidateQueries({ queryKey: ['shop', 'orders'] })
    },
  })
}

export function useCancelOrder() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ number, reason, phone }) => {
      const { data } = await api.post(`/shop/orders/${number}/cancel`, {
        reason,
        phone: phone || undefined,
      })

      return data
    },
    onSuccess(_data, variables) {
      queryClient.invalidateQueries({ queryKey: ['shop', 'orders'] })
    },
  })
}
