import { fireEvent, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test, vi } from 'vitest'
import { renderApp } from '../test/render'

describe('PairPage', () => {
  test('shows a pending invite code after refresh from GET /invites/current', async () => {
    renderApp({ route: '/pair', as: 'alice', seed: 'invite' })
    expect(await screen.findByText('7K2P9Q')).toBeInTheDocument()
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined)
    fireEvent.click(screen.getByTestId('copy-invite-code'))
    expect(writeText).toHaveBeenCalledWith('7K2P9Q')
  })

  test('lets the other demo user accept the invite and enter chores', async () => {
    const user = userEvent.setup()
    renderApp({ route: '/pair', as: 'bob', seed: 'invite' })
    await screen.findByRole('heading', { name: '关联对象' })
    await user.type(screen.getByPlaceholderText('输入对方的邀请码'), '7K2P9Q')
    await user.click(screen.getByRole('button', { name: '接受邀请' }))
    expect(await screen.findByRole('heading', { name: '家务' })).toBeInTheDocument()
  })
})
