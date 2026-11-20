import { useNavigate } from 'react-router-dom'
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, PullToRefresh, Toast } from 'antd-mobile'
import { api } from '../api/resources'
import { queryKeys } from '../api/queryKeys'
import { useSession } from '../auth/SessionProvider'
import { AmountText } from '../components/AmountText'
import { EmptyState } from '../components/EmptyState'
import { ErrorRetry } from '../components/ErrorRetry'
import { ListSkeleton } from '../components/ListSkeleton'
import { PwaHint } from '../components/PwaHint'
import { StatusTag } from '../components/StatusTag'
import { createIdempotencySlot } from '../api/idempotency'
import { useRef } from 'react'
import type { Task, TaskStatus } from '../api/types'
import { invalidateHouseholdQueries } from '../hooks/invalidate'
import { errorMessage } from '../components/ErrorRetry'

const WORKER_STATUSES: TaskStatus[] = ['in_progress', 'pending_confirm', 'rejected']

export default function ChoresPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { user, workspaceHousehold, activeHousehold, readOnly, refreshSession } = useSession()
  const householdId = workspaceHousehold?.id ?? ''
  const userId = user?.id ?? ''
  const startSlot = useRef(createIdempotencySlot())

  const enabled = Boolean(user && householdId)

  const summary = useQuery({
    queryKey: queryKeys.ledgerSummary(userId, householdId),
    queryFn: () => api.getLedgerSummary(householdId),
    enabled,
  })
  const review = useQuery({
    queryKey: queryKeys.tasks(userId, householdId, { role: 'reviewer', status: 'pending_confirm' }),
    queryFn: () => api.listTasks(householdId, { role: 'reviewer', status: 'pending_confirm' }),
    enabled,
  })
  const workerQueries = useQueries({
    queries: WORKER_STATUSES.map((status) => ({
      queryKey: queryKeys.tasks(userId, householdId, { role: 'worker', status }),
      queryFn: () => api.listTasks(householdId, { role: 'worker', status }),
      enabled,
    })),
  })
  const types = useQuery({
    queryKey: queryKeys.choreTypes(userId, householdId),
    queryFn: () => api.listChoreTypes(householdId, true),
    enabled,
  })

  const start = useMutation({
    mutationFn: (choreTypeId: string) => api.startTask(householdId, choreTypeId, startSlot.current.key()),
    onSuccess: async (task) => {
      startSlot.current.rotate()
      await invalidateHouseholdQueries(queryClient, userId, householdId)
      navigate(`/tasks/${task.id}`)
    },
    onError: (err) => Toast.show({ content: errorMessage(err) }),
  })

  async function refreshAll() {
    await refreshSession()
    if (enabled) await invalidateHouseholdQueries(queryClient, userId, householdId)
  }

  if (!activeHousehold && !workspaceHousehold) {
    return (
      <main className="page">
        <h1>家务</h1>
        <EmptyState title="先邀请对方或填写邀请码，关联后再开始记账" action={<Button color="primary" onClick={() => navigate('/pair')}>去关联</Button>} />
      </main>
    )
  }

  const loading = [summary, review, types, ...workerQueries].some((item) => item.isLoading)
  const failed = [summary, review, types, ...workerQueries].find((item) => item.error)

  const myTasks = workerQueries.flatMap((item) => item.data?.items ?? [])
  const reviewTasks = review.data?.items ?? []
  const choreTypes = types.data?.items ?? []

  return (
    <main className="page">
      <PullToRefresh onRefresh={refreshAll}>
        <h1>家务</h1>
        {activeHousehold ? <PwaHint /> : <p className="hint">当前为解绑后的只读历史，不能再开始或审核家务。</p>}
        {loading ? <ListSkeleton /> : null}
        {failed ? <ErrorRetry error={failed.error} onRetry={() => void refreshAll()} /> : null}

        <div className="section-title">待我审核</div>
        {reviewTasks.length === 0 && !loading ? <p className="muted">没有待你确认完工的家务</p> : null}
        {reviewTasks.map((task) => (
          <TaskCard key={task.id} task={task} onOpen={() => navigate(`/tasks/${task.id}`)} />
        ))}

        <div className="section-title">我的任务</div>
        {myTasks.length === 0 && !loading ? (
          <EmptyState title="没有进行中的家务，可以从下方模板「开始」" />
        ) : null}
        {myTasks.map((task) => (
          <TaskCard key={task.id} task={task} onOpen={() => navigate(`/tasks/${task.id}`)} />
        ))}

        <div className="section-title">家务模板</div>
        {choreTypes.length === 0 && !loading ? (
          <EmptyState
            title="先添加一项家务并定价，再开始做"
            action={
              !readOnly ? (
                <Button color="primary" onClick={() => navigate('/chores/new')}>
                  新增家务
                </Button>
              ) : null
            }
          />
        ) : null}
        {choreTypes.map((item) => (
          <div className="card" key={item.id}>
            <div className="row">
              <div>
                <div className="break">{item.name}</div>
                <AmountText fen={item.unit_price_fen} size="sm" />
                {!item.is_active ? <div><span className="status-tag">已停用</span></div> : null}
              </div>
              {!readOnly && item.is_active ? (
                <Button
                  className="tap-btn"
                  color="primary"
                  size="small"
                  loading={start.isPending}
                  disabled={start.isPending}
                  onClick={() => start.mutate(item.id)}
                >
                  开始
                </Button>
              ) : null}
            </div>
            {!readOnly ? (
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <Button fill="outline" size="small" onClick={() => navigate(`/chores/${item.id}/edit`)}>
                  编辑
                </Button>
                {item.is_active ? (
                  <DeactivateButton householdId={householdId} choreTypeId={item.id} userId={userId} />
                ) : null}
              </div>
            ) : null}
          </div>
        ))}
        {!readOnly && choreTypes.length > 0 ? (
          <div className="bottom-actions">
            <Button className="tap-btn" block fill="outline" onClick={() => navigate('/chores/new')}>
              新增家务
            </Button>
          </div>
        ) : null}
      </PullToRefresh>
    </main>
  )
}

function TaskCard({ task, onOpen }: { task: Task; onOpen: () => void }) {
  return (
    <button type="button" className="card" onClick={onOpen} style={{ width: '100%', textAlign: 'left', border: 0 }}>
      <div className="row">
        <div>
          <div className="break">{task.name_snapshot}</div>
          <AmountText fen={task.unit_price_fen_snapshot} size="sm" />
        </div>
        <StatusTag kind="task" status={task.status} />
      </div>
    </button>
  )
}

function DeactivateButton({ householdId, choreTypeId, userId }: { householdId: string; choreTypeId: string; userId: string }) {
  const queryClient = useQueryClient()
  const slot = useRef(createIdempotencySlot())
  const mutation = useMutation({
    mutationFn: () => api.deactivateChoreType(householdId, choreTypeId, slot.current.key()),
    onSuccess: async () => {
      slot.current.rotate()
      await invalidateHouseholdQueries(queryClient, userId, householdId)
      Toast.show({ content: '已停用' })
    },
    onError: (err) => Toast.show({ content: errorMessage(err) }),
  })
  return (
    <Button fill="outline" color="danger" size="small" loading={mutation.isPending} disabled={mutation.isPending} onClick={() => mutation.mutate()}>
      停用
    </Button>
  )
}
