import { describe, expect, test } from 'vitest'
import { fenToYuanString, formatFen, yuanStringToFen } from './fen'

describe('yuanStringToFen', () => {
  test('parses two-decimal yuan to fen without float math', () => {
    expect(yuanStringToFen('12.34')).toEqual({ ok: true, fen: 1234 })
    expect(yuanStringToFen('0.01')).toEqual({ ok: true, fen: 1 })
    expect(yuanStringToFen('8')).toEqual({ ok: true, fen: 800 })
    expect(yuanStringToFen('8.5')).toEqual({ ok: true, fen: 850 })
  })

  test('rejects zero empty negative and extra decimals', () => {
    for (const value of ['', '  ', '0', '0.00', '-1', '1.234', 'abc', '1.2.3', '+2']) {
      expect(yuanStringToFen(value).ok, value).toBe(false)
    }
  })

  test('rejects amounts above the contract maximum', () => {
    expect(yuanStringToFen('1000000.01').ok).toBe(false)
    expect(yuanStringToFen('1000000').ok).toBe(true)
  })
})

describe('fen formatting', () => {
  test('formats fen as yuan with two decimals', () => {
    expect(fenToYuanString(1234)).toBe('12.34')
    expect(fenToYuanString(50)).toBe('0.50')
    expect(formatFen(50)).toBe('¥0.50')
    expect(formatFen(800)).toBe('¥8.00')
  })
})
