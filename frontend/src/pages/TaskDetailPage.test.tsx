import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test } from 'vitest'
import { DEMO, TASK_PENDING_ID } from '../test/fixtures'
import { seedActiveHousehold, seedPendingReviewTask, seedTask, state } from '../test/mockApi'
import { tokenStore } from '../auth/tokenStore'
import { issueTokens, resetMockState } from '../test/mockApi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { SessionProvider } from '../auth/SessionProvider'
import { BootGate } from '../routes/guards'
import { AppRoutes } from '../routes/router'

function renderSeeded(route: string, person: 'alice' | 'bob', seed: () => void) {
  resetMockState()
  seedActiveHousehold()
  seed()
  const demo = DEMO[person]
  const tokens = issueTokens(demo.id)
  tokenStore.setTokens({ access_token: tokens.access_token, refresh_token: tokens.refresh_token })
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>
        <SessionProvider>
          <BootGate>
            <AppRoutes />
          </BootGate>
        </SessionProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('TaskDetailPage', () => {
  test('lets the worker withdraw a pending task and then shows submit, not confirm', async () => {
    const user = userEvent.setup()
    renderSeeded(`/tasks/${TASK_PENDING_ID}`, 'alice', () => {
      seedPendingReviewTask()
    })
    const withdraws = await screen.findAllByRole('button', { name: '撤回提交，继续做' })
    expect(withdraws.length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: '确认完成' })).not.toBeInTheDocument()
    await user.click(withdraws[0])
    const confirmWithdraw = await screen.findAllByRole('button', { name: '撤回提交，继续做' })
    await user.click(confirmWithdraw[confirmWithdraw.length - 1])
    expect(await screen.findByRole('button', { name: '提交完成' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '取消本次' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '确认完成' })).not.toBeInTheDocument()
  })

  test('lets the payer confirm work and then hides irreversible actions', async () => {
    const user = userEvent.setup()
    renderSeeded(`/tasks/${TASK_PENDING_ID}`, 'bob', () => {
      seedPendingReviewTask()
    })
    await user.click(await screen.findByRole('button', { name: '确认完成' }))
    expect(await screen.findByText(/确认后将记一笔应付工资/)).toBeInTheDocument()
    expect(screen.getByText(/此操作不能撤销/)).toBeInTheDocument()
    const confirms = screen.getAllByRole('button', { name: '确认完成' })
    await user.click(confirms[confirms.length - 1])
    expect(await screen.findByText('已确认')).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: '确认完成' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: '拒绝' })).not.toBeInTheDocument()
    })
    expect(state.wages).toHaveLength(1)
  })

  test('does not show confirm actions to the worker on their own task', async () => {
    renderSeeded(`/tasks/${TASK_PENDING_ID}`, 'alice', () => {
      seedPendingReviewTask()
    })
    expect((await screen.findAllByRole('button', { name: '撤回提交，继续做' })).length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: '确认完成' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '拒绝' })).not.toBeInTheDocument()
  })

  test('keeps review history when the worker resubmits a rejected task', async () => {
    const user = userEvent.setup()
    const task = { id: TASK_PENDING_ID }
    renderSeeded(`/tasks/${TASK_PENDING_ID}`, 'alice', () => {
      seedTask({
        id: TASK_PENDING_ID,
        workerId: DEMO.alice.id,
        payerId: DEMO.bob.id,
        status: 'rejected',
        rejectReason: '没做完',
      })
    })
    await user.click(await screen.findByRole('button', { name: '重新提交' }))
    const submits = await screen.findAllByRole('button', { name: '重新提交' })
    await user.click(submits[submits.length - 1])
    expect((await screen.findAllByText('待确认完工')).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/没做完/).length).toBeGreaterThan(0)
    void task
  })
})
