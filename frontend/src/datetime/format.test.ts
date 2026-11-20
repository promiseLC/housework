import { describe, expect, test } from 'vitest'
import { formatDateTime } from './format'

describe('formatDateTime', () => {
  test('renders a UTC instant in Asia/Shanghai', () => {
    const text = formatDateTime('2026-11-20T10:00:00.000Z')
    expect(text).toContain('2026')
    expect(text).toContain('18:00')
  })
})
