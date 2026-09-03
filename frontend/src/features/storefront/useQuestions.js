import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, get } from '../../lib/api'

/**
 * Approved questions for a product, with the shop's answers.
 *
 * Public and unauthenticated on both sides: reading needs no account, and
 * neither does asking -- see the shop QuestionController for why.
 */
export function useProductQuestions(slug, { page = 1 } = {}) {
  return useQuery({
    queryKey: ['shop', 'product', slug, 'questions', page],
    queryFn: () => get(`/shop/products/${slug}/questions`, { params: { page } }),
    enabled: Boolean(slug),
  })
}

export function useAskQuestion(slug) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ asker_name, asker_email, question }) => {
      const { data } = await api.post(`/shop/products/${slug}/questions`, {
        asker_name,
        asker_email,
        question,
      })

      return data
    },
    onSuccess() {
      // The new question is Pending, so it will not appear yet. The list is
      // refetched anyway: a shopper who asks and sees nothing change assumes
      // the button did not work, and the panel says so in words instead.
      queryClient.invalidateQueries({ queryKey: ['shop', 'product', slug, 'questions'] })
    },
  })
}
