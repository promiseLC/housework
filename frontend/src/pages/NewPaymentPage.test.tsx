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
import { DEMO } from '../test/fixtures'
import { issueTokens, resetMockState, seedActiveHousehold, seedTask, state } from '../test/mockApi'

function renderAsBob() {
  resetMockState()
  seedActiveHousehold()
  const task = seedTask({
    workerId: DEMO.alice.id,
    payerId: DEMO.bob.id,
    status: 'confirmed',
    name: '洗碗',
    priceFen: 800,
  })
  const tokens = issueTokens(DEMO.bob.id)
  tokenStore.setTokens({ access_token: tokens.access_token, refresh_token: tokens.refresh_token })
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/payments/new']}>
        <SessionProvider>
          <BootGate>
            <AppRoutes />
          </BootGate>
        </SessionProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return { task, queryClient }
}

describe('NewPaymentPage', () => {
  test('previews selected wages then marks paid as awaiting receipt, not settled', async () => {
    const user = userEvent.setup()
    renderAsBob()
    await screen.findByRole('heading', { name: '标记已付款' })
    await user.click(await screen.findByText(/洗碗/))
    expect(await screen.findByText(/付款人/)).toBeInTheDocument()
    expect(screen.getByText('¥8.00')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '我已线下付款' }))
    const confirms = await screen.findAllByRole('button', { name: '我已线下付款' })
    await user.click(confirms[confirms.length - 1])
    expect(await screen.findByText('待确认收款')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '确认已收款' })).not.toBeInTheDocument()
    expect(state.payments[0]?.status).toBe('awaiting_receipt')
    expect(state.wages[0]?.status).toBe('awaiting_receipt')
  })

  test('reloads the list when create fails after a successful preview because the wage is locked', async () => {
    const user = userEvent.setup()
    renderAsBob()
    await screen.findByRole('heading', { name: '标记已付款' })
    await user.click(await screen.findByText(/洗碗/))
    await screen.findByText(/付款人/)
    state.wages[0].status = 'awaiting_receipt'
    state.wages[0].locked_payment_id = '00000000-0000-4000-8000-00000000lock'
    await user.click(screen.getByRole('button', { name: '我已线下付款' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(dialog.querySelector('.adm-button-primary') as HTMLElement)
    expect(await screen.findByRole('alert')).toHaveTextContent(/可付款状态|已被占用/)
    expect(state.payments).toHaveLength(0)
  })
})
