import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { useEffect, useState } from 'react'
import { ApiError } from '../lib/api'
import { useAuthStore } from '../stores/authStore'
import { ToastProvider } from '../components/ui/Toast'

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        retry(failureCount, error) {
          // Retrying an authorisation failure or a business-rule refusal
          // just delays the same answer three more times.
          if (error instanceof ApiError) {
            if ([401, 403, 404, 409, 422].includes(error.status)) return false
          }

          return failureCount < 2
        },
      },
      mutations: {
        retry: false,
      },
    },
  })
}

export function Providers({ children }) {
  const [queryClient] = useState(createQueryClient)
  const bootstrap = useAuthStore((state) => state.bootstrap)

  // Establish who we are once, before any guarded route decides to redirect.
  useEffect(() => {
    bootstrap()
  }, [bootstrap])

  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>{children}</ToastProvider>
      {import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} />}
    </QueryClientProvider>
  )
}
