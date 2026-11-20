import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'
import { SessionProvider } from './auth/SessionProvider'
import { BootGate } from './routes/guards'
import { AppRoutes } from './routes/router'

export function createAppQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 10_000 },
      mutations: { retry: false },
    },
  })
}

export default function App() {
  const [queryClient] = useState(() => createAppQueryClient())
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <SessionProvider>
          <BootGate>
            <AppRoutes />
          </BootGate>
        </SessionProvider>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
