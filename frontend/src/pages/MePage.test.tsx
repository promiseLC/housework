import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, test } from 'vitest'
import { tokenStore } from '../auth/tokenStore'
import { SessionProvider } from '../auth/SessionProvider'
import { BootGate } from '../routes/guards'
import { AppRoutes } from '../routes/router'
import { DEMO, TASK_PENDING_ID } from '../test/fixtures'
import { issueTokens, resetMockState, seedActiveHousehold, seedTask } from '../test/mockApi'

describe('MePage unbind', () => {
  test('blocks unbind when a withdrawn task is still in progress', async () => {
    const user = userEvent.setup()
    resetMockState()
    seedActiveHousehold()
    seedTask({
      id: TASK_PENDING_ID,
      workerId: DEMO.alice.id,
      payerId: DEMO.bob.id,
      status: 'in_progress',
    })
    const tokens = issueTokens(DEMO.alice.id)
    tokenStore.setTokens({ access_token: tokens.access_token, refresh_token: tokens.refresh_token })
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/me']}>
          <SessionProvider>
            <BootGate>
              <AppRoutes />
            </BootGate>
          </SessionProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    )
    await user.click(await screen.findByRole('button', { name: '解绑' }))
    const confirms = await screen.findAllByRole('button', { name: '确认解绑' })
    await user.click(confirms[confirms.length - 1])
    expect(await screen.findByText('还有未完成的家务或未结清的工资，暂时不能解绑')).toBeInTheDocument()
  })
})
