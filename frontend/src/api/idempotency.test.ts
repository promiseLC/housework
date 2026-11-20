import { describe, expect, test } from 'vitest'
import { createIdempotencySlot } from './idempotency'

describe('createIdempotencySlot', () => {
  test('reuses the same key until the operation is rotated', () => {
    const slot = createIdempotencySlot()
    const first = slot.key()
    const retry = slot.key()
    expect(first).toBe(retry)
    expect(first.length).toBeGreaterThanOrEqual(8)
    expect(first.length).toBeLessThanOrEqual(64)
    slot.rotate()
    expect(slot.key()).not.toBe(first)
  })
})
