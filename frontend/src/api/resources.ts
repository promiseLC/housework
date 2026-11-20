import { apiRequest } from './client'
import type {
  AuthTokenResponse,
  ChoreType,
  ChoreTypeListResponse,
  HouseholdDetail,
  HouseholdListResponse,
  InviteCreatedResponse,
  InviteStatusResponse,
  LedgerSummary,
  MeResponse,
  PaymentDetail,
  PaymentListResponse,
  PaymentPreview,
  TaskDetail,
  TaskListResponse,
  WageListResponse,
} from './types'

export const api = {
  register(body: { username: string; password: string; display_name: string }, idempotencyKey: string) {
    return apiRequest<AuthTokenResponse>('/auth/register', {
      method: 'POST',
      body,
      idempotencyKey,
      auth: false,
    })
  },
  login(body: { username: string; password: string }, idempotencyKey: string) {
    return apiRequest<AuthTokenResponse>('/auth/login', {
      method: 'POST',
      body,
      idempotencyKey,
      auth: false,
    })
  },
  logout(refreshToken: string) {
    return apiRequest<void>('/auth/logout', {
      method: 'POST',
      body: { refresh_token: refreshToken },
    })
  },
  getMe() {
    return apiRequest<MeResponse>('/me')
  },
  createInvite(idempotencyKey: string) {
    return apiRequest<InviteCreatedResponse>('/invites', { method: 'POST', idempotencyKey })
  },
  getCurrentInvite() {
    return apiRequest<InviteStatusResponse>('/invites/current')
  },
  regenerateInvite(idempotencyKey: string) {
    return apiRequest<InviteCreatedResponse>('/invites/regenerate', { method: 'POST', idempotencyKey })
  },
  cancelCurrentInvite() {
    return apiRequest<void>('/invites/current', { method: 'DELETE' })
  },
  acceptInvite(code: string, idempotencyKey: string) {
    return apiRequest<HouseholdDetail>('/invites/accept', {
      method: 'POST',
      body: { code },
      idempotencyKey,
    })
  },
  listHouseholds() {
    return apiRequest<HouseholdListResponse>('/households')
  },
  getHousehold(householdId: string) {
    return apiRequest<HouseholdDetail>(`/households/${householdId}`)
  },
  unbindHousehold(householdId: string, idempotencyKey: string) {
    return apiRequest<HouseholdDetail>(`/households/${householdId}/unbind`, {
      method: 'POST',
      idempotencyKey,
    })
  },
  listChoreTypes(householdId: string, includeInactive = true) {
    return apiRequest<ChoreTypeListResponse>(`/households/${householdId}/chore-types`, {
      query: { include_inactive: includeInactive },
    })
  },
  createChoreType(
    householdId: string,
    body: { name: string; unit_price_fen: number },
    idempotencyKey: string,
  ) {
    return apiRequest<ChoreType>(`/households/${householdId}/chore-types`, {
      method: 'POST',
      body,
      idempotencyKey,
    })
  },
  updateChoreType(
    householdId: string,
    choreTypeId: string,
    body: { name?: string; unit_price_fen?: number },
  ) {
    return apiRequest<ChoreType>(`/households/${householdId}/chore-types/${choreTypeId}`, {
      method: 'PATCH',
      body,
    })
  },
  deactivateChoreType(householdId: string, choreTypeId: string, idempotencyKey: string) {
    return apiRequest<ChoreType>(`/households/${householdId}/chore-types/${choreTypeId}/deactivate`, {
      method: 'POST',
      idempotencyKey,
    })
  },
  listTasks(
    householdId: string,
    params: { status?: string; role?: string; page?: number; page_size?: number } = {},
  ) {
    return apiRequest<TaskListResponse>(`/households/${householdId}/tasks`, { query: params })
  },
  startTask(householdId: string, choreTypeId: string, idempotencyKey: string) {
    return apiRequest<TaskDetail>(`/households/${householdId}/tasks`, {
      method: 'POST',
      body: { chore_type_id: choreTypeId },
      idempotencyKey,
    })
  },
  getTask(householdId: string, taskId: string) {
    return apiRequest<TaskDetail>(`/households/${householdId}/tasks/${taskId}`)
  },
  submitTask(householdId: string, taskId: string, note: string | undefined, idempotencyKey: string) {
    return apiRequest<TaskDetail>(`/households/${householdId}/tasks/${taskId}/submit`, {
      method: 'POST',
      body: note ? { note } : {},
      idempotencyKey,
    })
  },
  withdrawTask(householdId: string, taskId: string, idempotencyKey: string) {
    return apiRequest<TaskDetail>(`/households/${householdId}/tasks/${taskId}/withdraw`, {
      method: 'POST',
      idempotencyKey,
    })
  },
  cancelTask(householdId: string, taskId: string, idempotencyKey: string) {
    return apiRequest<TaskDetail>(`/households/${householdId}/tasks/${taskId}/cancel`, {
      method: 'POST',
      idempotencyKey,
    })
  },
  confirmTask(householdId: string, taskId: string, idempotencyKey: string) {
    return apiRequest<TaskDetail>(`/households/${householdId}/tasks/${taskId}/confirm`, {
      method: 'POST',
      idempotencyKey,
    })
  },
  rejectTask(householdId: string, taskId: string, reason: string, idempotencyKey: string) {
    return apiRequest<TaskDetail>(`/households/${householdId}/tasks/${taskId}/reject`, {
      method: 'POST',
      body: { reason },
      idempotencyKey,
    })
  },
  listWages(
    householdId: string,
    params: { status?: string; direction?: string; page?: number; page_size?: number } = {},
  ) {
    return apiRequest<WageListResponse>(`/households/${householdId}/wages`, { query: params })
  },
  listPayments(householdId: string, params: { status?: string; page?: number; page_size?: number } = {}) {
    return apiRequest<PaymentListResponse>(`/households/${householdId}/payments`, { query: params })
  },
  previewPayment(householdId: string, wageIds: string[]) {
    return apiRequest<PaymentPreview>(`/households/${householdId}/payments/preview`, {
      method: 'POST',
      body: { wage_ids: wageIds },
    })
  },
  createPayment(householdId: string, wageIds: string[], idempotencyKey: string) {
    return apiRequest<PaymentDetail>(`/households/${householdId}/payments`, {
      method: 'POST',
      body: { wage_ids: wageIds },
      idempotencyKey,
    })
  },
  getPayment(householdId: string, paymentId: string) {
    return apiRequest<PaymentDetail>(`/households/${householdId}/payments/${paymentId}`)
  },
  confirmPaymentReceived(householdId: string, paymentId: string, idempotencyKey: string) {
    return apiRequest<PaymentDetail>(
      `/households/${householdId}/payments/${paymentId}/confirm-received`,
      { method: 'POST', idempotencyKey },
    )
  },
  rejectPaymentReceived(householdId: string, paymentId: string, reason: string, idempotencyKey: string) {
    return apiRequest<PaymentDetail>(
      `/households/${householdId}/payments/${paymentId}/reject-received`,
      { method: 'POST', body: { reason }, idempotencyKey },
    )
  },
  getLedgerSummary(householdId: string) {
    return apiRequest<LedgerSummary>(`/households/${householdId}/ledger/summary`)
  },
}
