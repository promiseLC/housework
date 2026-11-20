export type UserPublic = {
  id: string
  username: string
  display_name: string
}

export type AuthTokenResponse = {
  access_token: string
  refresh_token: string
  token_type: 'bearer'
  expires_in: number
  user: UserPublic
}

export type HouseholdStatus = 'active' | 'dissolved'

export type HouseholdMember = {
  user_id: string
  display_name: string
  joined_at: string
  left_at: string | null
}

export type HouseholdSummary = {
  id: string
  status: HouseholdStatus
  created_at: string
  dissolved_at?: string | null
  members: HouseholdMember[]
}

export type HouseholdDetail = HouseholdSummary

export type HouseholdListResponse = { items: HouseholdSummary[] }

export type MeResponse = {
  user: UserPublic
  active_household: HouseholdSummary | null
}

export type InviteStatus = 'pending' | 'accepted' | 'expired' | 'cancelled'

export type InviteCreatedResponse = {
  id: string
  code: string
  expires_at: string
  status: 'pending'
}

export type InvitePublic = {
  id: string
  code: string | null
  status: InviteStatus
  expires_at: string
  created_at: string
}

export type InviteStatusResponse = { invite: InvitePublic | null }

export type ChoreType = {
  id: string
  household_id: string
  name: string
  unit_price_fen: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export type ChoreTypeListResponse = { items: ChoreType[] }

export type TaskStatus = 'in_progress' | 'pending_confirm' | 'rejected' | 'confirmed' | 'cancelled'

export type WageStatus = 'payable' | 'awaiting_receipt' | 'settled'

export type Wage = {
  id: string
  household_id: string
  task_id: string
  chore_name?: string
  amount_fen: number
  worker_user_id: string
  payer_user_id: string
  status: WageStatus
  locked_payment_id?: string | null
  created_at: string
  settled_at?: string | null
}

export type Task = {
  id: string
  household_id: string
  chore_type_id: string
  name_snapshot: string
  unit_price_fen_snapshot: number
  worker_user_id: string
  payer_user_id: string
  status: TaskStatus
  note?: string | null
  started_at: string
  submitted_at?: string | null
  cancelled_at?: string | null
  confirmed_at?: string | null
  rejected_at?: string | null
  reject_reason?: string | null
  version: number
  wage?: Wage | null
}

export type ReviewAction = 'submit' | 'withdraw' | 'confirm' | 'reject'

export type TaskReviewEvent = {
  id: string
  task_id: string
  actor_user_id: string
  action: ReviewAction
  reason?: string | null
  created_at: string
}

export type TaskDetail = Task & { review_events: TaskReviewEvent[] }

export type PageList<T> = {
  items: T[]
  page: number
  page_size: number
  total: number
}

export type TaskListResponse = PageList<Task>
export type WageListResponse = PageList<Wage>

export type PaymentStatus = 'awaiting_receipt' | 'settled' | 'rejected'

export type PaymentItem = {
  wage_id: string
  amount_fen: number
  chore_name?: string
  task_id?: string
}

export type Payment = {
  id: string
  household_id: string
  payer_user_id: string
  payee_user_id: string
  total_amount_fen: number
  status: PaymentStatus
  reject_reason?: string | null
  marked_paid_at: string
  settled_at?: string | null
  rejected_at?: string | null
  created_at: string
}

export type PaymentDetail = Payment & { items: PaymentItem[] }
export type PaymentListResponse = PageList<Payment>

export type PaymentPreview = {
  payer: UserPublic
  payee: UserPublic
  items: PaymentItem[]
  total_amount_fen: number
  wage_count: number
}

export type LedgerSummary = {
  household_id: string
  household_status: HouseholdStatus
  me: UserPublic
  partner: UserPublic | null
  pending_confirm_as_reviewer_count: number
  pending_confirm_as_worker_count: number
  in_progress_count?: number
  payable_to_me_fen: number
  payable_by_me_fen: number
  awaiting_my_receipt_fen: number
  awaiting_partner_receipt_fen: number
  settled_to_me_fen: number
  settled_by_me_fen: number
}

export type TokenPair = {
  access_token: string
  refresh_token: string
  expires_in?: number
}
