import type { QueryClient } from '@tanstack/react-query'

export function invalidateHouseholdQueries(queryClient: QueryClient, userId: string, householdId: string) {
  return queryClient.invalidateQueries({
    predicate: (query) => query.queryKey.includes(userId) && query.queryKey.includes(householdId),
  })
}

export function invalidateUserQueries(queryClient: QueryClient, userId: string) {
  return queryClient.invalidateQueries({
    predicate: (query) => query.queryKey.includes(userId),
  })
}
