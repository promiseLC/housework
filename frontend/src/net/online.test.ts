import { afterEach, describe, expect, test } from 'vitest'
import { ApiRequestError } from '../api/errors'
import { assertOnline, OFFLINE_MESSAGE } from './online'

const original = navigator.onLine

afterEach(() => {
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: original })
})

describe('assertOnline', () => {
  test('throws a syncable-ledger message when offline', () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false })
    expect(() => assertOnline()).toThrowError(ApiRequestError)
    try {
      assertOnline()
    } catch (error) {
      expect(error).toMatchObject({ code: 'OFFLINE', message: OFFLINE_MESSAGE })
    }
  })

  test('does not throw when online', () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true })
    expect(() => assertOnline()).not.toThrow()
  })
})
