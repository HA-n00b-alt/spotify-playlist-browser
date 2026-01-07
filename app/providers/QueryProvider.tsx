'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Stale time: 5 minutes - data is considered fresh for 5 minutes
            staleTime: 5 * 60 * 1000,
            // Cache time: 30 minutes - unused data stays in cache for 30 minutes
            gcTime: 30 * 60 * 1000, // Previously called cacheTime
            // Retry failed requests 2 times
            retry: 2,
            // Refetch on window focus (but only if data is stale)
            refetchOnWindowFocus: true,
            // Don't refetch on mount if data is fresh
            refetchOnMount: false,
          },
        },
      })
  )

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  )
}












