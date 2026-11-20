import { HttpResponse } from 'msw/http'
import {
  CHORE_DISH_ID,
  DEMO,
  HOUSEHOLD_ACTIVE_ID,
  HOUSEHOLD_DISSOLVED_ID,
  TASK_PENDING_ID,
} from './fixtures'
import type {
  ChoreType,
  HouseholdMember,
  HouseholdSummary,
  InvitePublic,
  PaymentDetail,
  PaymentItem,
  TaskDetail,
  TaskReviewEvent,
  UserPublic,
  Wage,
} from '../api/types'

type DemoUser = UserPublic & { password: string }

type StoredInvite = InvitePublic & { inviter_user_id: string; code_plain: string | null }

type StoredHousehold = HouseholdSummary

type IdempotencyRecord = { path: string; bodyHash: string; status: number; body: unknown }

export type MockState = {
  users: DemoUser[]
  accessTokens: Map<string, string>
  refreshTokens: Map<string, string>
  invites: StoredInvite[]
  households: StoredHousehold[]
  choreTypes: ChoreType[]
  tasks: TaskDetail[]
  wages: Wage[]
  payments: PaymentDetail[]
  idempotency: Map<string, IdempotencyRecord>
}

const USERNAME_RE = /^[A-Za-z0-9_\u4e00-\u9fff]{2,32}$/

let seq = 100
function uid(prefix = '00') {
  seq += 1
  return `00000000-0000-4000-8000-${prefix}${String(seq).padStart(8, '0')}`
}

function nowIso() {
  return new Date('2026-11-20T10:00:00.000Z').toISOString()
}

function publicUser(user: DemoUser): UserPublic {
  return { id: user.id, username: user.username, display_name: user.display_name }
}

function error(status: number, code: string, message: string, details: Record<string, unknown> = {}) {
  return HttpResponse.json({ error: { code, message, details } }, { status })
}

function hashBody(body: unknown) {
  return JSON.stringify(body ?? null)
}

function createState(): MockState {
  return {
    users: [],
    accessTokens: new Map(),
    refreshTokens: new Map(),
    invites: [],
    households: [],
    choreTypes: [],
    tasks: [],
    wages: [],
    payments: [],
    idempotency: new Map(),
  }
}

export let state: MockState = createState()

export function resetMockState() {
  seq = 100
  state = createState()
  for (const demo of Object.values(DEMO)) {
    state.users.push({ ...demo })
  }
}

resetMockState()

function findUserById(id: string) {
  return state.users.find((user) => user.id === id)
}

function findUserByUsername(username: string) {
  return state.users.find((user) => user.username.toLowerCase() === username.toLowerCase())
}

export function issueTokens(userId: string) {
  const access = `demo-access-${userId}-${uid('tk')}`
  const refresh = `demo-refresh-${userId}-${uid('rk')}`
  state.accessTokens.set(access, userId)
  state.refreshTokens.set(refresh, userId)
  return { access_token: access, refresh_token: refresh, token_type: 'bearer' as const, expires_in: 3600 }
}

export function getUserFromAuth(request: Request): DemoUser | null {
  const header = request.headers.get('Authorization') ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''
  if (!token) return null
  const userId = state.accessTokens.get(token)
  return userId ? findUserById(userId) ?? null : null
}

function activeHouseholdFor(userId: string) {
  return state.households.find(
    (household) =>
      household.status === 'active' &&
      household.members.some((member) => member.user_id === userId && !member.left_at),
  ) ?? null
}

function partnerOf(household: StoredHousehold, userId: string): UserPublic | null {
  const other = household.members.find((member) => member.user_id !== userId)
  if (!other) return null
  const user = findUserById(other.user_id)
  return user ? publicUser(user) : { id: other.user_id, username: '', display_name: other.display_name }
}

function isActiveMember(household: StoredHousehold, userId: string) {
  return household.status === 'active' && household.members.some((m) => m.user_id === userId && !m.left_at)
}

function isVisibleMember(household: StoredHousehold, userId: string) {
  return household.members.some((m) => m.user_id === userId)
}

function requireUser(request: Request) {
  const user = getUserFromAuth(request)
  if (!user) return { user: null, response: error(401, 'UNAUTHORIZED', '未登录或令牌无效') }
  return { user, response: null }
}

function requireHousehold(user: DemoUser, householdId: string, write: boolean) {
  const household = state.households.find((item) => item.id === householdId)
  if (!household || !isVisibleMember(household, user.id)) {
    return { household: null, response: error(404, 'NOT_FOUND', '资源不存在或不在当前用户可见家庭内') }
  }
  if (write && !isActiveMember(household, user.id)) {
    return { household, response: error(409, 'HOUSEHOLD_DISSOLVED', '家庭已解绑，历史只读') }
  }
  return { household, response: null }
}

function currentInvite(userId: string): StoredInvite | null {
  const pending = state.invites.find(
    (invite) => invite.inviter_user_id === userId && invite.status === 'pending' && invite.expires_at > nowIso(),
  )
  return pending ?? null
}

function expireIfNeeded(invite: StoredInvite) {
  if (invite.status === 'pending' && invite.expires_at <= nowIso()) {
    invite.status = 'expired'
    invite.code = null
    invite.code_plain = null
  }
}

export function seedActiveHousehold() {
  const alice = findUserByUsername(DEMO.alice.username)!
  const bob = findUserByUsername(DEMO.bob.username)!
  const members: HouseholdMember[] = [
    { user_id: alice.id, display_name: alice.display_name, joined_at: nowIso(), left_at: null },
    { user_id: bob.id, display_name: bob.display_name, joined_at: nowIso(), left_at: null },
  ]
  state.households.push({
    id: HOUSEHOLD_ACTIVE_ID,
    status: 'active',
    created_at: nowIso(),
    dissolved_at: null,
    members,
  })
  state.choreTypes.push({
    id: CHORE_DISH_ID,
    household_id: HOUSEHOLD_ACTIVE_ID,
    name: '洗碗',
    unit_price_fen: 800,
    is_active: true,
    created_at: nowIso(),
    updated_at: nowIso(),
  })
  return HOUSEHOLD_ACTIVE_ID
}

export function seedDissolvedHousehold() {
  const alice = findUserByUsername(DEMO.alice.username)!
  const bob = findUserByUsername(DEMO.bob.username)!
  state.households.push({
    id: HOUSEHOLD_DISSOLVED_ID,
    status: 'dissolved',
    created_at: nowIso(),
    dissolved_at: nowIso(),
    members: [
      { user_id: alice.id, display_name: alice.display_name, joined_at: nowIso(), left_at: nowIso() },
      { user_id: bob.id, display_name: bob.display_name, joined_at: nowIso(), left_at: nowIso() },
    ],
  })
  return HOUSEHOLD_DISSOLVED_ID
}

export function seedPendingInvite(fromUsername: string = DEMO.alice.username, code = '7K2P9Q') {
  const inviter = findUserByUsername(fromUsername)!
  const invite: StoredInvite = {
    id: uid('iv'),
    code,
    code_plain: code,
    status: 'pending',
    expires_at: '2026-11-27T10:00:00.000Z',
    created_at: nowIso(),
    inviter_user_id: inviter.id,
  }
  state.invites.push(invite)
  return invite
}

export function seedTask(options: {
  id?: string
  householdId?: string
  workerId: string
  payerId: string
  status: TaskDetail['status']
  name?: string
  priceFen?: number
  note?: string
  rejectReason?: string
}) {
  const id = options.id ?? uid('tt')
  const task: TaskDetail = {
    id,
    household_id: options.householdId ?? HOUSEHOLD_ACTIVE_ID,
    chore_type_id: CHORE_DISH_ID,
    name_snapshot: options.name ?? '洗碗',
    unit_price_fen_snapshot: options.priceFen ?? 800,
    worker_user_id: options.workerId,
    payer_user_id: options.payerId,
    status: options.status,
    note: options.note ?? null,
    started_at: nowIso(),
    submitted_at: options.status === 'in_progress' || options.status === 'cancelled' ? null : nowIso(),
    cancelled_at: options.status === 'cancelled' ? nowIso() : null,
    confirmed_at: options.status === 'confirmed' ? nowIso() : null,
    rejected_at: options.status === 'rejected' ? nowIso() : null,
    reject_reason: options.rejectReason ?? null,
    version: 1,
    wage: null,
    review_events: [],
  }
  if (options.status !== 'in_progress' && options.status !== 'cancelled') {
    task.review_events.push({
      id: uid('ev'),
      task_id: id,
      actor_user_id: options.workerId,
      action: 'submit',
      reason: options.note ?? null,
      created_at: nowIso(),
    })
  }
  if (options.status === 'rejected') {
    task.review_events.push({
      id: uid('ev'),
      task_id: id,
      actor_user_id: options.payerId,
      action: 'reject',
      reason: options.rejectReason ?? '没做完',
      created_at: nowIso(),
    })
  }
  if (options.status === 'confirmed') {
    const wage: Wage = {
      id: uid('wg'),
      household_id: task.household_id,
      task_id: task.id,
      chore_name: task.name_snapshot,
      amount_fen: task.unit_price_fen_snapshot,
      worker_user_id: task.worker_user_id,
      payer_user_id: task.payer_user_id,
      status: 'payable',
      locked_payment_id: null,
      created_at: nowIso(),
      settled_at: null,
    }
    task.wage = wage
    state.wages.push(wage)
    task.review_events.push({
      id: uid('ev'),
      task_id: id,
      actor_user_id: options.payerId,
      action: 'confirm',
      reason: null,
      created_at: nowIso(),
    })
  }
  state.tasks.push(task)
  return task
}

export function seedPendingReviewTask() {
  return seedTask({
    id: TASK_PENDING_ID,
    workerId: DEMO.alice.id,
    payerId: DEMO.bob.id,
    status: 'pending_confirm',
  })
}

function pageItems<T>(items: T[], url: URL) {
  const page = Number(url.searchParams.get('page') ?? 1)
  const pageSize = Number(url.searchParams.get('page_size') ?? 20)
  const start = (page - 1) * pageSize
  return { items: items.slice(start, start + pageSize), page, page_size: pageSize, total: items.length }
}

function ledgerSummary(household: StoredHousehold, me: DemoUser) {
  const tasks = state.tasks.filter((task) => task.household_id === household.id)
  const wages = state.wages.filter((wage) => wage.household_id === household.id)
  const payments = state.payments.filter((payment) => payment.household_id === household.id)
  return {
    household_id: household.id,
    household_status: household.status,
    me: publicUser(me),
    partner: partnerOf(household, me.id),
    pending_confirm_as_reviewer_count: tasks.filter((t) => t.status === 'pending_confirm' && t.payer_user_id === me.id).length,
    pending_confirm_as_worker_count: tasks.filter((t) => t.status === 'pending_confirm' && t.worker_user_id === me.id).length,
    in_progress_count: tasks.filter((t) => t.status === 'in_progress').length,
    payable_to_me_fen: wages.filter((w) => w.worker_user_id === me.id && w.status === 'payable').reduce((s, w) => s + w.amount_fen, 0),
    payable_by_me_fen: wages.filter((w) => w.payer_user_id === me.id && w.status === 'payable').reduce((s, w) => s + w.amount_fen, 0),
    awaiting_my_receipt_fen: payments.filter((p) => p.payee_user_id === me.id && p.status === 'awaiting_receipt').reduce((s, p) => s + p.total_amount_fen, 0),
    awaiting_partner_receipt_fen: payments.filter((p) => p.payer_user_id === me.id && p.status === 'awaiting_receipt').reduce((s, p) => s + p.total_amount_fen, 0),
    settled_to_me_fen: wages.filter((w) => w.worker_user_id === me.id && w.status === 'settled').reduce((s, w) => s + w.amount_fen, 0),
    settled_by_me_fen: wages.filter((w) => w.payer_user_id === me.id && w.status === 'settled').reduce((s, w) => s + w.amount_fen, 0),
  }
}

async function readJson(request: Request) {
  try {
    return await request.json()
  } catch {
    return null
  }
}

function appendEvent(task: TaskDetail, actor: string, action: TaskReviewEvent['action'], reason?: string | null) {
  task.review_events = [
    ...task.review_events,
    { id: uid('ev'), task_id: task.id, actor_user_id: actor, action, reason: reason ?? null, created_at: nowIso() },
  ]
  task.version += 1
}

async function handleIdempotent(userId: string, request: Request, path: string, run: () => Promise<Response> | Response) {
  const key = request.headers.get('Idempotency-Key')
  const method = request.method.toUpperCase()
  if (method !== 'POST' || path.endsWith('/preview') || !key) return run()
  if (key.length < 8 || key.length > 64) return error(422, 'VALIDATION_ERROR', 'Idempotency-Key 长度须为 8–64 个字符')
  const body = await request.clone().json().catch(() => null)
  const bodyHash = hashBody(body)
  const slot = `${userId}:${key}`
  const existing = state.idempotency.get(slot)
  if (existing) {
    if (existing.path !== path || existing.bodyHash !== bodyHash) {
      return error(409, 'IDEMPOTENCY_CONFLICT', '同一幂等键不能用于不同的请求')
    }
    return HttpResponse.json(existing.body as never, { status: existing.status })
  }
  const response = await run()
  const status = response.status
  const responseBody = status === 204 ? null : await response.clone().json().catch(() => null)
  state.idempotency.set(slot, { path, bodyHash, status, body: responseBody })
  return response
}

export async function handleApi(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const path = url.pathname.replace(/\/$/, '')
  const method = request.method.toUpperCase()
  const rest = path.replace(/^\/api\/v1/, '') || '/'

  if (method === 'POST' && rest === '/auth/register') {
    const body = (await readJson(request)) as { username?: string; password?: string; display_name?: string } | null
    if (!body?.username || !USERNAME_RE.test(body.username)) return error(422, 'VALIDATION_ERROR', '账号格式不正确')
    if (!body.password || body.password.length < 8 || body.password.length > 72) return error(422, 'VALIDATION_ERROR', '密码长度须为 8–72 位')
    if (!body.display_name || body.display_name.length < 1 || body.display_name.length > 20) return error(422, 'VALIDATION_ERROR', '显示名须为 1–20 个字')
    if (findUserByUsername(body.username)) return error(409, 'USERNAME_TAKEN', '该账号已被占用')
    const user: DemoUser = { id: uid('us'), username: body.username, password: body.password, display_name: body.display_name }
    state.users.push(user)
    const tokens = issueTokens(user.id)
    return HttpResponse.json({ ...tokens, user: publicUser(user) }, { status: 201 })
  }

  if (method === 'POST' && rest === '/auth/login') {
    const body = (await readJson(request)) as { username?: string; password?: string } | null
    const user = body?.username ? findUserByUsername(body.username) : null
    if (!user || user.password !== body?.password) return error(401, 'UNAUTHORIZED', '账号或密码不正确')
    const tokens = issueTokens(user.id)
    return HttpResponse.json({ ...tokens, user: publicUser(user) })
  }

  if (method === 'POST' && rest === '/auth/refresh') {
    const body = (await readJson(request)) as { refresh_token?: string } | null
    const userId = body?.refresh_token ? state.refreshTokens.get(body.refresh_token) : undefined
    const user = userId ? findUserById(userId) : null
    if (!user) return error(401, 'UNAUTHORIZED', '刷新令牌无效')
    state.refreshTokens.delete(body!.refresh_token!)
    const tokens = issueTokens(user.id)
    return HttpResponse.json({ ...tokens, user: publicUser(user) })
  }

  if (method === 'POST' && rest === '/auth/logout') {
    const body = (await readJson(request)) as { refresh_token?: string } | null
    if (body?.refresh_token) state.refreshTokens.delete(body.refresh_token)
    return new HttpResponse(null, { status: 204 })
  }

  const auth = requireUser(request)
  if (auth.response && rest !== '/auth/login') {
    // unauthenticated except already handled auth routes
    if (!getUserFromAuth(request) && !rest.startsWith('/auth/')) return auth.response
  }
  const user = auth.user
  if (!user) return auth.response!

  const guarded = (pathKey: string, run: () => Promise<Response> | Response) => handleIdempotent(user.id, request, pathKey, run)

  if (method === 'GET' && rest === '/me') {
    return HttpResponse.json({ user: publicUser(user), active_household: activeHouseholdFor(user.id) })
  }

  if (method === 'POST' && rest === '/invites') {
    return guarded(rest, () => {
      if (activeHouseholdFor(user.id)) return error(409, 'ALREADY_BOUND', '你已经绑定了家庭')
      if (currentInvite(user.id)) return error(409, 'CONFLICT', '已有一条有效邀请，请查看当前邀请或重新生成')
      const created = seedPendingInvite(user.username, `A${uid('cd').slice(-5)}`.slice(0, 6))
      return HttpResponse.json({ id: created.id, code: created.code, expires_at: created.expires_at, status: 'pending' }, { status: 201 })
    })
  }

  if (method === 'GET' && rest === '/invites/current') {
    const invite = currentInvite(user.id)
    if (invite) expireIfNeeded(invite)
    const current = currentInvite(user.id)
    return HttpResponse.json({
      invite: current
        ? { id: current.id, code: current.code, status: current.status, expires_at: current.expires_at, created_at: current.created_at }
        : null,
    })
  }

  if (method === 'POST' && rest === '/invites/regenerate') {
    return guarded(rest, () => {
      if (activeHouseholdFor(user.id)) return error(409, 'ALREADY_BOUND', '你已经绑定了家庭')
      const current = currentInvite(user.id)
      if (!current) return error(409, 'CONFLICT', '当前没有可作废的邀请，请先创建')
      current.status = 'cancelled'
      current.code = null
      current.code_plain = null
      const created = seedPendingInvite(user.username, `B${uid('cd').slice(-5)}`.slice(0, 6))
      return HttpResponse.json({ id: created.id, code: created.code, expires_at: created.expires_at, status: 'pending' }, { status: 201 })
    })
  }

  if (method === 'DELETE' && rest === '/invites/current') {
    const current = currentInvite(user.id)
    if (current) {
      current.status = 'cancelled'
      current.code = null
      current.code_plain = null
    }
    return new HttpResponse(null, { status: 204 })
  }

  if (method === 'POST' && rest === '/invites/accept') {
    return guarded(rest, async () => {
      const body = (await readJson(request)) as { code?: string } | null
      const code = body?.code?.trim() ?? ''
      if (code.length < 6 || code.length > 16) return error(422, 'VALIDATION_ERROR', '邀请码格式不正确')
      if (activeHouseholdFor(user.id)) return error(409, 'ALREADY_BOUND', '你已经绑定了家庭')
      const invite = state.invites.find((item) => item.code_plain === code)
      if (!invite) return error(409, 'INVITE_USED', '邀请码无效')
      expireIfNeeded(invite)
      if (invite.status === 'expired') return error(409, 'INVITE_EXPIRED', '邀请码已过期')
      if (invite.status === 'cancelled') return error(409, 'INVITE_CANCELLED', '邀请码已作废')
      if (invite.status !== 'pending') return error(409, 'INVITE_USED', '邀请码已使用')
      if (invite.inviter_user_id === user.id) return error(409, 'CANNOT_INVITE_SELF', '不能接受自己的邀请')
      if (activeHouseholdFor(invite.inviter_user_id)) return error(409, 'PARTNER_ALREADY_BOUND', '对方已有绑定')
      const inviter = findUserById(invite.inviter_user_id)!
      const household: StoredHousehold = {
        id: uid('hh'),
        status: 'active',
        created_at: nowIso(),
        dissolved_at: null,
        members: [
          { user_id: inviter.id, display_name: inviter.display_name, joined_at: nowIso(), left_at: null },
          { user_id: user.id, display_name: user.display_name, joined_at: nowIso(), left_at: null },
        ],
      }
      state.households.push(household)
      invite.status = 'accepted'
      invite.code = null
      invite.code_plain = null
      for (const other of state.invites) {
        if (other.status === 'pending' && (other.inviter_user_id === user.id || other.inviter_user_id === inviter.id)) {
          other.status = 'cancelled'
          other.code = null
          other.code_plain = null
        }
      }
      return HttpResponse.json(household, { status: 201 })
    })
  }

  if (method === 'GET' && rest === '/households') {
    const items = state.households.filter((household) => isVisibleMember(household, user.id))
    return HttpResponse.json({ items })
  }

  const householdMatch = rest.match(/^\/households\/([^/]+)(.*)$/)
  if (!householdMatch) return error(404, 'NOT_FOUND', '接口不存在')
  const householdId = householdMatch[1]
  const tail = householdMatch[2] || ''

  if (method === 'GET' && tail === '') {
    const found = requireHousehold(user, householdId, false)
    if (found.response) return found.response
    return HttpResponse.json(found.household)
  }

  if (method === 'POST' && tail === '/unbind') {
    return guarded(rest, () => {
      const found = requireHousehold(user, householdId, true)
      if (found.response) return found.response
      const household = found.household!
      const blockingTasks = state.tasks.filter(
        (task) =>
          task.household_id === household.id &&
          (task.status === 'in_progress' || task.status === 'pending_confirm' || task.status === 'rejected'),
      )
      const blockingWages = state.wages.filter(
        (wage) => wage.household_id === household.id && (wage.status === 'payable' || wage.status === 'awaiting_receipt'),
      )
      if (blockingTasks.length || blockingWages.length) {
        return error(409, 'UNBIND_BLOCKED', '还有未完成的家务或未结清的工资，暂时不能解绑', {
          in_progress: blockingTasks.filter((t) => t.status === 'in_progress').length,
          pending_confirm: blockingTasks.filter((t) => t.status === 'pending_confirm').length,
          rejected: blockingTasks.filter((t) => t.status === 'rejected').length,
          unpaid_wages: blockingWages.length,
        })
      }
      household.status = 'dissolved'
      household.dissolved_at = nowIso()
      household.members = household.members.map((member) => ({ ...member, left_at: nowIso() }))
      return HttpResponse.json(household)
    })
  }

  if (method === 'GET' && tail === '/chore-types') {
    const found = requireHousehold(user, householdId, false)
    if (found.response) return found.response
    const includeInactive = url.searchParams.get('include_inactive') === 'true'
    const items = state.choreTypes.filter((item) => item.household_id === householdId && (includeInactive || item.is_active))
    return HttpResponse.json({ items })
  }

  if (method === 'POST' && tail === '/chore-types') {
    return guarded(rest, async () => {
      const found = requireHousehold(user, householdId, true)
      if (found.response) return found.response
      const body = (await readJson(request)) as { name?: string; unit_price_fen?: number } | null
      if (!body?.name || body.name.length > 40) return error(422, 'VALIDATION_ERROR', '家务名称不合法')
      if (!body.unit_price_fen || body.unit_price_fen < 1) return error(422, 'VALIDATION_ERROR', '金额须为正整数分')
      if (state.choreTypes.some((item) => item.household_id === householdId && item.is_active && item.name === body.name)) {
        return error(409, 'CONFLICT', '已有同名的启用家务')
      }
      const created: ChoreType = {
        id: uid('ct'),
        household_id: householdId,
        name: body.name,
        unit_price_fen: body.unit_price_fen,
        is_active: true,
        created_at: nowIso(),
        updated_at: nowIso(),
      }
      state.choreTypes.push(created)
      return HttpResponse.json(created, { status: 201 })
    })
  }

  const chorePatch = tail.match(/^\/chore-types\/([^/]+)$/)
  if (method === 'PATCH' && chorePatch) {
    const found = requireHousehold(user, householdId, true)
    if (found.response) return found.response
    const item = state.choreTypes.find((row) => row.id === chorePatch[1] && row.household_id === householdId)
    if (!item) return error(404, 'NOT_FOUND', '家务模板不存在')
    const body = (await readJson(request)) as { name?: string; unit_price_fen?: number } | null
    if (body?.name) item.name = body.name
    if (body?.unit_price_fen) item.unit_price_fen = body.unit_price_fen
    item.updated_at = nowIso()
    return HttpResponse.json(item)
  }

  const choreOff = tail.match(/^\/chore-types\/([^/]+)\/deactivate$/)
  if (method === 'POST' && choreOff) {
    return guarded(rest, () => {
      const found = requireHousehold(user, householdId, true)
      if (found.response) return found.response
      const item = state.choreTypes.find((row) => row.id === choreOff[1] && row.household_id === householdId)
      if (!item) return error(404, 'NOT_FOUND', '家务模板不存在')
      item.is_active = false
      item.updated_at = nowIso()
      return HttpResponse.json(item)
    })
  }

  if (method === 'GET' && tail === '/tasks') {
    const found = requireHousehold(user, householdId, false)
    if (found.response) return found.response
    let items = state.tasks.filter((task) => task.household_id === householdId)
    const status = url.searchParams.get('status')
    const role = url.searchParams.get('role')
    if (status) items = items.filter((task) => task.status === status)
    if (role === 'worker') items = items.filter((task) => task.worker_user_id === user.id)
    if (role === 'reviewer') items = items.filter((task) => task.payer_user_id === user.id)
    const listed = items.map((task) => {
      const { review_events: _events, ...rest } = task
      void _events
      return rest
    })
    return HttpResponse.json(pageItems(listed, url))
  }

  if (method === 'POST' && tail === '/tasks') {
    return guarded(rest, async () => {
      const found = requireHousehold(user, householdId, true)
      if (found.response) return found.response
      const household = found.household!
      const body = (await readJson(request)) as { chore_type_id?: string } | null
      const type = state.choreTypes.find((item) => item.id === body?.chore_type_id && item.household_id === householdId)
      if (!type) return error(422, 'VALIDATION_ERROR', '家务模板不存在')
      if (!type.is_active) return error(409, 'CHORE_TYPE_INACTIVE', '该家务已停用，不能再开始')
      const partner = household.members.find((member) => member.user_id !== user.id && !member.left_at)
      if (!partner) return error(409, 'HOUSEHOLD_DISSOLVED', '家庭已解绑，历史只读')
      const task = seedTask({
        householdId,
        workerId: user.id,
        payerId: partner.user_id,
        status: 'in_progress',
        name: type.name,
        priceFen: type.unit_price_fen,
      })
      return HttpResponse.json(task, { status: 201 })
    })
  }

  const taskMatch = tail.match(/^\/tasks\/([^/]+)(?:\/(submit|withdraw|cancel|confirm|reject))?$/)
  if (taskMatch) {
    const task = state.tasks.find((item) => item.id === taskMatch[1] && item.household_id === householdId)
    const action = taskMatch[2]
    if (method === 'GET' && !action) {
      const found = requireHousehold(user, householdId, false)
      if (found.response) return found.response
      if (!task) return error(404, 'NOT_FOUND', '任务不存在')
      return HttpResponse.json(task)
    }
    if (!action) return error(404, 'NOT_FOUND', '接口不存在')
    return guarded(rest, async () => {
      const found = requireHousehold(user, householdId, true)
      if (found.response) return found.response
      if (!task) return error(404, 'NOT_FOUND', '任务不存在')
      if (action === 'submit') {
        if (task.worker_user_id !== user.id) return error(403, 'FORBIDDEN', '只有执行人可以提交')
        if (task.status !== 'in_progress' && task.status !== 'rejected') return error(409, 'TASK_INVALID_STATE', '当前状态不能提交')
        const body = (await readJson(request)) as { note?: string } | null
        if (body?.note !== undefined) task.note = body.note
        task.status = 'pending_confirm'
        task.submitted_at = nowIso()
        appendEvent(task, user.id, 'submit', body?.note ?? null)
        return HttpResponse.json(task)
      }
      if (action === 'withdraw') {
        if (task.worker_user_id !== user.id) return error(403, 'CANNOT_WITHDRAW_OTHERS_TASK', '只有执行人可以撤回提交')
        if (task.status !== 'pending_confirm') return error(409, 'TASK_INVALID_STATE', '只有待确认的任务可以撤回')
        task.status = 'in_progress'
        task.submitted_at = null
        appendEvent(task, user.id, 'withdraw')
        return HttpResponse.json(task)
      }
      if (action === 'cancel') {
        if (task.worker_user_id !== user.id) return error(403, 'FORBIDDEN', '只有执行人可以取消')
        if (task.status !== 'in_progress') return error(409, 'TASK_INVALID_STATE', '只有进行中的任务可以取消')
        task.status = 'cancelled'
        task.cancelled_at = nowIso()
        return HttpResponse.json(task)
      }
      if (action === 'confirm') {
        if (task.payer_user_id !== user.id || task.worker_user_id === user.id) {
          return error(403, 'CANNOT_REVIEW_OWN_TASK', '不能确认自己的任务')
        }
        if (task.status !== 'pending_confirm') return error(409, 'TASK_INVALID_STATE', '当前状态不能确认')
        task.status = 'confirmed'
        task.confirmed_at = nowIso()
        const wage: Wage = {
          id: uid('wg'),
          household_id: householdId,
          task_id: task.id,
          chore_name: task.name_snapshot,
          amount_fen: task.unit_price_fen_snapshot,
          worker_user_id: task.worker_user_id,
          payer_user_id: task.payer_user_id,
          status: 'payable',
          locked_payment_id: null,
          created_at: nowIso(),
          settled_at: null,
        }
        task.wage = wage
        state.wages.push(wage)
        appendEvent(task, user.id, 'confirm')
        return HttpResponse.json(task)
      }
      if (action === 'reject') {
        if (task.payer_user_id !== user.id || task.worker_user_id === user.id) {
          return error(403, 'CANNOT_REVIEW_OWN_TASK', '不能审核自己的任务')
        }
        if (task.status !== 'pending_confirm') return error(409, 'TASK_INVALID_STATE', '当前状态不能拒绝')
        const body = (await readJson(request)) as { reason?: string } | null
        if (!body?.reason?.trim()) return error(422, 'VALIDATION_ERROR', '请填写拒绝原因')
        task.status = 'rejected'
        task.rejected_at = nowIso()
        task.reject_reason = body.reason
        appendEvent(task, user.id, 'reject', body.reason)
        return HttpResponse.json(task)
      }
      return error(404, 'NOT_FOUND', '接口不存在')
    })
  }

  if (method === 'GET' && tail === '/wages') {
    const found = requireHousehold(user, householdId, false)
    if (found.response) return found.response
    let items = state.wages.filter((wage) => wage.household_id === householdId)
    const status = url.searchParams.get('status')
    const direction = url.searchParams.get('direction')
    if (status) items = items.filter((wage) => wage.status === status)
    if (direction === 'payable') items = items.filter((wage) => wage.payer_user_id === user.id)
    if (direction === 'receivable') items = items.filter((wage) => wage.worker_user_id === user.id)
    return HttpResponse.json(pageItems(items, url))
  }

  const wageMatch = tail.match(/^\/wages\/([^/]+)$/)
  if (method === 'GET' && wageMatch) {
    const found = requireHousehold(user, householdId, false)
    if (found.response) return found.response
    const wage = state.wages.find((item) => item.id === wageMatch[1] && item.household_id === householdId)
    if (!wage) return error(404, 'NOT_FOUND', '工资不存在')
    return HttpResponse.json(wage)
  }

  if (method === 'GET' && tail === '/payments') {
    const found = requireHousehold(user, householdId, false)
    if (found.response) return found.response
    let items = state.payments.filter((payment) => payment.household_id === householdId)
    const status = url.searchParams.get('status')
    if (status) items = items.filter((payment) => payment.status === status)
    const listed = items.map((payment) => {
      const { items: paymentItems, ...rest } = payment
      void paymentItems
      return rest
    })
    return HttpResponse.json(pageItems(listed, url))
  }

  if (method === 'POST' && tail === '/payments/preview') {
    const found = requireHousehold(user, householdId, false)
    if (found.response) return found.response
    const body = (await readJson(request)) as { wage_ids?: string[] } | null
    const wageIds = body?.wage_ids ?? []
    if (!wageIds.length) return error(422, 'VALIDATION_ERROR', '请至少选择一笔工资')
    const wages: Wage[] = []
    for (const id of wageIds) {
      const wage = state.wages.find((item) => item.id === id && item.household_id === householdId)
      if (!wage || wage.status !== 'payable' || wage.locked_payment_id) {
        return error(409, 'WAGE_NOT_PAYABLE', '所选工资不是可付款状态或已被占用')
      }
      wages.push(wage)
    }
    const payerId = wages[0].payer_user_id
    const payeeId = wages[0].worker_user_id
    if (payerId !== user.id) return error(403, 'FORBIDDEN', '只能为自己应付的工资创建结算')
    if (wages.some((wage) => wage.payer_user_id !== payerId || wage.worker_user_id !== payeeId)) {
      return error(409, 'WAGES_DIRECTION_MISMATCH', '只能勾选同一方向的工资')
    }
    const payer = findUserById(payerId)!
    const payee = findUserById(payeeId)!
    const items: PaymentItem[] = wages.map((wage) => ({
      wage_id: wage.id,
      amount_fen: wage.amount_fen,
      chore_name: wage.chore_name,
      task_id: wage.task_id,
    }))
    return HttpResponse.json({
      payer: publicUser(payer),
      payee: publicUser(payee),
      items,
      total_amount_fen: items.reduce((sum, item) => sum + item.amount_fen, 0),
      wage_count: items.length,
    })
  }

  if (method === 'POST' && tail === '/payments') {
    return guarded(rest, async () => {
      const found = requireHousehold(user, householdId, true)
      if (found.response) return found.response
      const body = (await readJson(request)) as { wage_ids?: string[] } | null
      const wageIds = body?.wage_ids ?? []
      if (!wageIds.length) return error(422, 'VALIDATION_ERROR', '请至少选择一笔工资')
      const wages: Wage[] = []
      for (const id of wageIds) {
        const wage = state.wages.find((item) => item.id === id && item.household_id === householdId)
        if (!wage || wage.status !== 'payable' || wage.locked_payment_id) {
          return error(409, 'WAGE_ALREADY_LOCKED', '所选工资不是可付款状态或已被占用')
        }
        wages.push(wage)
      }
      const payerId = wages[0].payer_user_id
      const payeeId = wages[0].worker_user_id
      if (payerId !== user.id) return error(403, 'FORBIDDEN', '只能为自己应付的工资创建结算')
      if (wages.some((wage) => wage.payer_user_id !== payerId || wage.worker_user_id !== payeeId)) {
        return error(409, 'WAGES_DIRECTION_MISMATCH', '只能勾选同一方向的工资')
      }
      const payment: PaymentDetail = {
        id: uid('pm'),
        household_id: householdId,
        payer_user_id: payerId,
        payee_user_id: payeeId,
        total_amount_fen: wages.reduce((sum, wage) => sum + wage.amount_fen, 0),
        status: 'awaiting_receipt',
        reject_reason: null,
        marked_paid_at: nowIso(),
        settled_at: null,
        rejected_at: null,
        created_at: nowIso(),
        items: wages.map((wage) => ({
          wage_id: wage.id,
          amount_fen: wage.amount_fen,
          chore_name: wage.chore_name,
          task_id: wage.task_id,
        })),
      }
      for (const wage of wages) {
        wage.status = 'awaiting_receipt'
        wage.locked_payment_id = payment.id
      }
      state.payments.push(payment)
      return HttpResponse.json(payment, { status: 201 })
    })
  }

  const paymentMatch = tail.match(/^\/payments\/([^/]+)(?:\/(confirm-received|reject-received))?$/)
  if (paymentMatch) {
    const payment = state.payments.find((item) => item.id === paymentMatch[1] && item.household_id === householdId)
    const action = paymentMatch[2]
    if (method === 'GET' && !action) {
      const found = requireHousehold(user, householdId, false)
      if (found.response) return found.response
      if (!payment) return error(404, 'NOT_FOUND', '结算单不存在')
      return HttpResponse.json(payment)
    }
    if (!action) return error(404, 'NOT_FOUND', '接口不存在')
    return guarded(rest, async () => {
      const found = requireHousehold(user, householdId, true)
      if (found.response) return found.response
      if (!payment) return error(404, 'NOT_FOUND', '结算单不存在')
      if (payment.payee_user_id !== user.id) return error(403, 'CANNOT_CONFIRM_OWN_PAYMENT', '付款人不能代收款人确认')
      if (payment.status !== 'awaiting_receipt') return error(409, 'PAYMENT_INVALID_STATE', '结算单当前不能操作')
      if (action === 'confirm-received') {
        payment.status = 'settled'
        payment.settled_at = nowIso()
        for (const item of payment.items) {
          const wage = state.wages.find((row) => row.id === item.wage_id)
          if (wage) {
            wage.status = 'settled'
            wage.settled_at = nowIso()
          }
        }
        return HttpResponse.json(payment)
      }
      const body = (await readJson(request)) as { reason?: string } | null
      if (!body?.reason?.trim()) return error(422, 'VALIDATION_ERROR', '请填写未到账原因')
      payment.status = 'rejected'
      payment.reject_reason = body.reason
      payment.rejected_at = nowIso()
      for (const item of payment.items) {
        const wage = state.wages.find((row) => row.id === item.wage_id)
        if (wage) {
          wage.status = 'payable'
          wage.locked_payment_id = null
        }
      }
      return HttpResponse.json(payment)
    })
  }

  if (method === 'GET' && tail === '/ledger/summary') {
    const found = requireHousehold(user, householdId, false)
    if (found.response) return found.response
    return HttpResponse.json(ledgerSummary(found.household!, user))
  }

  return error(404, 'NOT_FOUND', '接口不存在')
}
