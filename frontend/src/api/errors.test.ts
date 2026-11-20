import { describe, expect, test } from 'vitest'
import { parseApiError } from './errors'

describe('parseApiError', () => {
  test('reads error.code and message from the contract body', () => {
    const err = parseApiError(
      {
        error: {
          code: 'UNBIND_BLOCKED',
          message: '还有未完成的家务或未结清的工资，暂时不能解绑',
          details: { in_progress: 1 },
        },
      },
      409,
    )
    expect(err.code).toBe('UNBIND_BLOCKED')
    expect(err.message).toContain('未结清')
    expect(err.status).toBe(409)
    expect(err.details).toEqual({ in_progress: 1 })
  })

  test('falls back when the body is not an ErrorResponse', () => {
    const err = parseApiError('oops', 500)
    expect(err.code).toBe('UNKNOWN')
    expect(err.message).toBeTruthy()
    expect(err.status).toBe(500)
  })
})
