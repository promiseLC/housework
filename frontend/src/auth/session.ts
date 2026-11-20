import type { QueryClient } from '@tanstack/react-query'
import { tokenStore } from './tokenStore'

export function clearClientState(queryClient: QueryClient): void {
  queryClient.clear()
  tokenStore.clear()
}
