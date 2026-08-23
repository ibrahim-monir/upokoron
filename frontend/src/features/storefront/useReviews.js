import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, get } from '../../lib/api'

/**
 * Approved reviews for a product, public.
 */
export function useProductReviews(slug, { page = 1 } = {}) {
  return useQuery({
    queryKey: ['shop', 'product', slug, 'reviews', page],
    queryFn: () => get(`/shop/products/${slug}/reviews`, { params: { page } }),
    enabled: Boolean(slug),
  })
}

/**
 * The signed-in customer's own review of this product, if any. Disabled for
 * guests -- the endpoint requires auth and there is nothing to prefill.
 */
export function useMyReview(slug, { enabled = true } = {}) {
  return useQuery({
    queryKey: ['shop', 'product', slug, 'my-review'],
    queryFn: () => get(`/shop/products/${slug}/reviews/mine`),
    enabled: Boolean(slug) && enabled,
  })
}

/**
 * Writing a review changes what the product's own rating_avg/rating_count
 * are, so the product query is invalidated alongside the review lists --
 * otherwise the header stars would sit stale until the next navigation.
 */
function useReviewMutation(slug) {
  const queryClient = useQueryClient()

  return {
    onSuccess() {
      queryClient.invalidateQueries({ queryKey: ['shop', 'product', slug] })
    },
  }
}

export function useSubmitReview(slug) {
  const { onSuccess } = useReviewMutation(slug)

  return useMutation({
    mutationFn: async ({ rating, title, comment }) => {
      const { data } = await api.post(`/shop/products/${slug}/reviews`, { rating, title, comment })
      return data
    },
    onSuccess,
  })
}

export function useUpdateReview(slug) {
  const { onSuccess } = useReviewMutation(slug)

  return useMutation({
    mutationFn: async ({ reviewId, rating, title, comment }) => {
      const { data } = await api.put(`/shop/products/${slug}/reviews/${reviewId}`, { rating, title, comment })
      return data
    },
    onSuccess,
  })
}

export function useDeleteReview(slug) {
  const { onSuccess } = useReviewMutation(slug)

  return useMutation({
    mutationFn: async (reviewId) => {
      const { data } = await api.delete(`/shop/products/${slug}/reviews/${reviewId}`)
      return data
    },
    onSuccess,
  })
}
