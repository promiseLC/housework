import { QueryClient } from '@tanstack/react-query'
import { describe, expect, test, vi } from 'vitest'
import { invalidateUserQueries } from './hooks/invalidate'
import { queryKeys } from './api/queryKeys'
import { DEMO } from './test/fixtures'

describe('foreground refresh helper', () => {
  test('invalidates queries that belong to the current user', async () => {
    const queryClient = new QueryClient()
    const spy = vi.fn()
    queryClient.setQueryData(queryKeys.ledgerSummary(DEMO.alice.id, 'h1'), { payable_by_me_fen: 1 })
    queryClient.setQueryData(queryKeys.ledgerSummary(DEMO.bob.id, 'h1'), { payable_by_me_fen: 2 })
    const unsub = queryClient.getQueryCache().subscribe((event) => {
      if (event.type === 'updated' || event.type === 'removed' || event.type === 'observerAdded') spy(event)
    })
    await invalidateUserQueries(queryClient, DEMO.alice.id)
    unsub()
    const aliceState = queryClient.getQueryState(queryKeys.ledgerSummary(DEMO.alice.id, 'h1'))
    const bobState = queryClient.getQueryState(queryKeys.ledgerSummary(DEMO.bob.id, 'h1'))
    expect(aliceState?.isInvalidated).toBe(true)
    expect(bobState?.isInvalidated).toBeFalsy()
  })
})
