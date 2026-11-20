import { screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, test } from 'vitest'
import { tokenStore } from '../auth/tokenStore'
import { SessionProvider } from '../auth/SessionProvider'
import { BootGate } from '../routes/guards'
import { AppRoutes } from '../routes/router'
import { DEMO } from '../test/fixtures'
import { issueTokens, resetMockState, seedActiveHousehold, seedTask } from '../test/mockApi'

describe('LedgerPage', () => {
  test('shows payable amounts independently without netting', async () => {
    resetMockState()
    seedActiveHousehold()
    seedTask({ workerId: DEMO.alice.id, payerId: DEMO.bob.id, status: 'confirmed', priceFen: 800, name: '洗碗' })
    seedTask({ workerId: DEMO.bob.id, payerId: DEMO.alice.id, status: 'confirmed', priceFen: 300, name: '扫地' })
    const tokens = issueTokens(DEMO.bob.id)
    tokenStore.setTokens({ access_token: tokens.access_token, refresh_token: tokens.refresh_token })
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/ledger']}>
          <SessionProvider>
            <BootGate>
              <AppRoutes />
            </BootGate>
          </SessionProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    )
    expect(await screen.findByText('我应付')).toBeInTheDocument()
    expect(screen.getByText('对方应付给我')).toBeInTheDocument()
    expect(screen.getByText('¥8.00')).toBeInTheDocument()
    expect(screen.getByText('¥3.00')).toBeInTheDocument()
    expect(screen.queryByText('¥5.00')).not.toBeInTheDocument()
  })
})
