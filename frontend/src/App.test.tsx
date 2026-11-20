import { screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { renderApp } from './test/render'

describe('app routes', () => {
  test('shows login when signed out', async () => {
    renderApp({ route: '/login' })
    expect(await screen.findByRole('heading', { name: '登录' })).toBeInTheDocument()
  })
})
