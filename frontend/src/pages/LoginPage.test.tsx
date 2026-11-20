import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test } from 'vitest'
import { queryKeys } from '../api/queryKeys'
import { DEMO } from '../test/fixtures'
import { renderApp } from '../test/render'
import { seedActiveHousehold, state } from '../test/mockApi'

describe('LoginPage', () => {
  test('sends an unpaired demo user to the pairing page', async () => {
    const user = userEvent.setup()
    renderApp({ route: '/login' })
    await screen.findByRole('heading', { name: '登录' })
    await user.type(screen.getByPlaceholderText('请输入账号'), DEMO.alice.username)
    await user.type(screen.getByPlaceholderText('请输入密码'), DEMO.alice.password)
    await user.click(screen.getByRole('button', { name: '登录' }))
    expect(await screen.findByRole('heading', { name: '关联对象' })).toBeInTheDocument()
  })

  test('shows the backend message when the password is wrong', async () => {
    const user = userEvent.setup()
    renderApp({ route: '/login' })
    await screen.findByRole('heading', { name: '登录' })
    await user.type(screen.getByPlaceholderText('请输入账号'), DEMO.alice.username)
    await user.type(screen.getByPlaceholderText('请输入密码'), 'wrong-pass-demo')
    await user.click(screen.getByRole('button', { name: '登录' }))
    expect(await screen.findByText('账号或密码不正确')).toBeInTheDocument()
  })

  test('clears the previous account cache after logout and another login', async () => {
    const user = userEvent.setup()
    seedActiveHousehold()
    const first = renderApp({ route: '/chores', as: 'alice', seed: 'paired' })
    expect(await screen.findByRole('heading', { name: '家务' })).toBeInTheDocument()
    first.queryClient.setQueryData(queryKeys.ledgerSummary(DEMO.alice.id, state.households[0].id), {
      payable_by_me_fen: 9999,
    })
    const nav = screen.getByRole('navigation', { name: '主导航' })
    await user.click(nav.querySelector('.adm-tab-bar-item:last-child') as HTMLElement)
    await user.click(await screen.findByRole('button', { name: '退出登录' }))
    expect(await screen.findByRole('heading', { name: '登录' })).toBeInTheDocument()
    expect(first.queryClient.getQueryCache().getAll()).toHaveLength(0)
    await user.type(screen.getByPlaceholderText('请输入账号'), DEMO.bob.username)
    await user.type(screen.getByPlaceholderText('请输入密码'), DEMO.bob.password)
    await user.click(screen.getByRole('button', { name: '登录' }))
    await waitFor(() => {
      expect(
        first.queryClient.getQueryData(queryKeys.ledgerSummary(DEMO.alice.id, state.households[0]?.id ?? 'missing')),
      ).toBeUndefined()
    })
  })
})
