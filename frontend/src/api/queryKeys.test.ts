import { QueryClient } from '@tanstack/react-query'
import { describe, expect, test } from 'vitest'
import { queryKeys } from './queryKeys'
import { clearClientState } from '../auth/session'
import { tokenStore } from '../auth/tokenStore'

describe('queryKeys', () => {
  test('isolates ledger summary by user and household', () => {
    expect(queryKeys.ledgerSummary('u1', 'h1')).not.toEqual(queryKeys.ledgerSummary('u2', 'h1'))
    expect(queryKeys.ledgerSummary('u1', 'h1')).not.toEqual(queryKeys.ledgerSummary('u1', 'h2'))
  })
})

describe('clearClientState', () => {
  test('drops all queries and tokens', () => {
    const qc = new QueryClient()
    qc.setQueryData(queryKeys.ledgerSummary('u1', 'h1'), { payable_by_me_fen: 100 })
    tokenStore.setTokens({ access_token: 'a', refresh_token: 'r' })
    clearClientState(qc)
    expect(qc.getQueryCache().getAll()).toHaveLength(0)
    expect(tokenStore.getAccessToken()).toBeNull()
    expect(tokenStore.getRefreshToken()).toBeNull()
  })
})
