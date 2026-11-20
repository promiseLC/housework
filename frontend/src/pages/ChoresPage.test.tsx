import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test } from 'vitest'
import { renderApp } from '../test/render'
import { state } from '../test/mockApi'

describe('ChoresPage and templates', () => {
  test('creates a template with integer fen and starts a snapshot-priced task', async () => {
    const user = userEvent.setup()
    renderApp({ route: '/chores/new', as: 'alice', seed: 'paired' })
    await screen.findByRole('heading', { name: '新增家务' })
    await user.type(screen.getByPlaceholderText('例如：洗碗'), '拖地')
    await user.type(screen.getByPlaceholderText('例如 8 或 12.34'), '12.34')
    await user.click(screen.getByRole('button', { name: '添加' }))
    await waitFor(() => {
      const created = state.choreTypes.find((item) => item.name === '拖地')
      expect(created?.unit_price_fen).toBe(1234)
    })
    expect(await screen.findByText('拖地')).toBeInTheDocument()
    const startButtons = await screen.findAllByRole('button', { name: '开始' })
    await user.click(startButtons[startButtons.length - 1])
    expect(await screen.findByRole('heading', { name: '拖地' })).toBeInTheDocument()
    expect(screen.getByText('¥12.34')).toBeInTheDocument()
  })
})
