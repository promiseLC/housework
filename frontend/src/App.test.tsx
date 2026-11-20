import { render, screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import App from './App'

describe('App scaffold', () => {
  test('renders the product name', () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: '家务计酬' })).toBeInTheDocument()
  })
})
