import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { useEffect, useState } from 'react'
import { ApiError, get } from '../lib/api'
import { useAuthStore } from '../stores/authStore'
import { useTheme } from '../lib/useTheme'
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

/**
 * Applies the store's saved colours to the document.
 *
 * It lives here rather than in StorefrontLayout because the admin panel is
 * the same brand and has no layout in common with the shop -- theming one
 * and not the other is how the back office ends up looking like a different
 * product. The same query key as the storefront header, so this shares that
 * request instead of adding one.
 */
function ThemeGate() {
  const settings = useQuery({
    queryKey: ['shop', 'settings'],
    queryFn: () => get('/shop/settings'),
    staleTime: 5 * 60 * 1000,
    select: (response) => response.data,
  })

  useTheme(settings.data)

  return null
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
      <ThemeGate />
      <ToastProvider>{children}</ToastProvider>
      {import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} />}
    </QueryClientProvider>
  )
}
