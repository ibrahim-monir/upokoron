import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { del, get, post, put } from '../../lib/api'
import { useToast } from '../../components/ui'

/**
 * Read a list endpoint.
 *
 * `placeholderData` keeps the previous page on screen while the next one
 * loads, so paging and filtering do not blank the table on every keystroke.
 */
export function useList(key, url, params = {}, options = {}) {
  return useQuery({
    queryKey: [key, params],
    queryFn: () => get(url, { params }),
    placeholderData: (previous) => previous,
    ...options,
  })
}

export function useRecord(key, url, options = {}) {
  return useQuery({
    queryKey: [key, url],
    queryFn: () => get(url),
    ...options,
  })
}

/**
 * A write that refreshes its list afterwards and reports the outcome.
 *
 * The API answers with a written message on success and on refusal, so both
 * are shown as-is rather than being replaced by a generic "Saved".
 */
export function useWrite(key, { onSuccess, successMessage } = {}) {
  const queryClient = useQueryClient()
  const toast = useToast()

  return useMutation({
    mutationFn: async ({ method = 'post', url, body }) => {
      if (method === 'put') return put(url, body)
      if (method === 'delete') return del(url)

      return post(url, body)
    },
    onSuccess(data, variables) {
      queryClient.invalidateQueries({ queryKey: [key] })
      toast.success(successMessage ?? data?.message ?? 'Saved.')
      onSuccess?.(data, variables)
    },
    onError(error) {
      // 409 means the input was fine and a rule said no. That message is
      // written for a human and is worth showing verbatim.
      toast.error(error?.message ?? 'Could not save.')
    },
  })
}
