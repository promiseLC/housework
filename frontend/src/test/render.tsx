import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { SessionProvider } from '../auth/SessionProvider'
import { tokenStore } from '../auth/tokenStore'
import { BootGate } from '../routes/guards'
import { AppRoutes } from '../routes/router'
import { DEMO } from './fixtures'
import {
  issueTokens,
  resetMockState,
  seedActiveHousehold,
  seedDissolvedHousehold,
  seedPendingInvite,
} from './mockApi'

export type DemoPerson = keyof typeof DEMO

export function renderApp(options: {
  route: string
  as?: DemoPerson | null
  seed?: 'none' | 'paired' | 'invite' | 'dissolved'
}) {
  resetMockState()
  if (options.seed === 'paired') seedActiveHousehold()
  if (options.seed === 'dissolved') seedDissolvedHousehold()
  if (options.seed === 'invite') seedPendingInvite()
  if (options.as) {
    const demo = DEMO[options.as]
    const tokens = issueTokens(demo.id)
    tokenStore.setTokens({ access_token: tokens.access_token, refresh_token: tokens.refresh_token })
  }

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })

  const view = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[options.route]}>
        <SessionProvider>
          <BootGate>
            <AppRoutes />
          </BootGate>
        </SessionProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )

  return { ...view, queryClient }
}
