import { screen, waitFor } from '@testing-library/react'
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

function seedAwaitingPayment() {
  resetMockState()
  seedActiveHousehold()
  seedTask({ workerId: DEMO.alice.id, payerId: DEMO.bob.id, status: 'confirmed', priceFen: 800, name: '洗碗' })
  const wage = state.wages[0]
  const payment = {
    id: '00000000-0000-4000-8000-00000000pm01',
    household_id: wage.household_id,
    payer_user_id: wage.payer_user_id,
    payee_user_id: wage.worker_user_id,
    total_amount_fen: wage.amount_fen,
    status: 'awaiting_receipt' as const,
    reject_reason: null,
    marked_paid_at: '2026-11-20T10:00:00.000Z',
    settled_at: null,
    rejected_at: null,
    created_at: '2026-11-20T10:00:00.000Z',
    items: [{ wage_id: wage.id, amount_fen: wage.amount_fen, chore_name: wage.chore_name, task_id: wage.task_id }],
  }
  wage.status = 'awaiting_receipt'
  wage.locked_payment_id = payment.id
  state.payments.push(payment)
  return payment
}

function renderPayment(person: 'alice' | 'bob') {
  const payment = seedAwaitingPayment()
  const tokens = issueTokens(DEMO[person].id)
  tokenStore.setTokens({ access_token: tokens.access_token, refresh_token: tokens.refresh_token })
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/payments/${payment.id}`]}>
        <SessionProvider>
          <BootGate>
            <AppRoutes />
          </BootGate>
        </SessionProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return payment
}

describe('PaymentDetailPage', () => {
  test('hides receipt confirmation from the payer', async () => {
    renderPayment('bob')
    expect(await screen.findByRole('heading', { name: '结算单' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '确认已收款' })).not.toBeInTheDocument()
  })

  test('lets the payee settle and then hides revoke actions', async () => {
    const user = userEvent.setup()
    renderPayment('alice')
    await user.click(await screen.findByRole('button', { name: '确认已收款' }))
    const confirms = await screen.findAllByRole('button', { name: '确认已收款' })
    await user.click(confirms[confirms.length - 1])
    expect(await screen.findByText('已结清')).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: '确认已收款' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: '未到账，拒绝' })).not.toBeInTheDocument()
    })
    expect(state.payments[0].status).toBe('settled')
    expect(state.wages[0].status).toBe('settled')
  })
})
