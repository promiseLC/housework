export type TaskListParams = {
  status?: string
  role?: string
  page?: number
}

export type WageListParams = {
  status?: string
  direction?: string
  page?: number
}

export type PaymentListParams = {
  status?: string
  page?: number
}

export const queryKeys = {
  me: (userId: string) => ['me', userId] as const,
  invitesCurrent: (userId: string) => ['invites', 'current', userId] as const,
  households: (userId: string) => ['households', userId] as const,
  household: (userId: string, householdId: string) => ['household', userId, householdId] as const,
  choreTypes: (userId: string, householdId: string) => ['choreTypes', userId, householdId] as const,
  tasks: (userId: string, householdId: string, params: TaskListParams = {}) =>
    ['tasks', userId, householdId, params] as const,
  task: (userId: string, householdId: string, taskId: string) =>
    ['task', userId, householdId, taskId] as const,
  wages: (userId: string, householdId: string, params: WageListParams = {}) =>
    ['wages', userId, householdId, params] as const,
  wage: (userId: string, householdId: string, wageId: string) =>
    ['wage', userId, householdId, wageId] as const,
  payments: (userId: string, householdId: string, params: PaymentListParams = {}) =>
    ['payments', userId, householdId, params] as const,
  payment: (userId: string, householdId: string, paymentId: string) =>
    ['payment', userId, householdId, paymentId] as const,
  ledgerSummary: (userId: string, householdId: string) =>
    ['ledgerSummary', userId, householdId] as const,
}

export function householdMutationKey(userId: string, householdId: string) {
  return ['household-data', userId, householdId] as const
}
