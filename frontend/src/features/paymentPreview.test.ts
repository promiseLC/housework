import { describe, expect, test } from 'vitest'
import { assertPreviewMatchesSelection } from './paymentPreview'
import type { PaymentPreview } from '../api/types'

const preview: PaymentPreview = {
  payer: { id: 'u1', username: 'a', display_name: '阿A' },
  payee: { id: 'u2', username: 'b', display_name: '阿B' },
  items: [
    { wage_id: 'w1', amount_fen: 200, chore_name: '洗碗' },
    { wage_id: 'w2', amount_fen: 300, chore_name: '扫地' },
  ],
  total_amount_fen: 500,
  wage_count: 2,
}

describe('assertPreviewMatchesSelection', () => {
  test('accepts the same wage ids in any order', () => {
    expect(assertPreviewMatchesSelection(preview, ['w2', 'w1'])).toEqual({ ok: true })
  })

  test('rejects mismatched ids, counts, or zero totals', () => {
    expect(assertPreviewMatchesSelection(preview, ['w1']).ok).toBe(false)
    expect(assertPreviewMatchesSelection({ ...preview, total_amount_fen: 0 }, ['w1', 'w2']).ok).toBe(false)
    expect(assertPreviewMatchesSelection(preview, ['w1', 'w3']).ok).toBe(false)
  })
})
