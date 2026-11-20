import { useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, TextArea, Toast } from 'antd-mobile'
import { api } from '../api/resources'
import { queryKeys } from '../api/queryKeys'
import { createIdempotencySlot } from '../api/idempotency'
import { useSession } from '../auth/SessionProvider'
import { AmountText } from '../components/AmountText'
import { ConfirmActionDialog } from '../components/ConfirmActionDialog'
import { ErrorRetry, errorMessage } from '../components/ErrorRetry'
import { ListSkeleton } from '../components/ListSkeleton'
import { StatusTag } from '../components/StatusTag'
import { formatDateTime } from '../datetime/format'
import { getTaskActions } from '../features/taskActions'
import { invalidateHouseholdQueries } from '../hooks/invalidate'
import { formatFen } from '../money/fen'
import type { TaskAction } from '../features/taskActions'

type DialogKind = 'submit' | 'cancel' | 'withdraw' | 'confirm' | 'reject' | 'resubmit' | null

const ACTION_LABEL: Record<TaskAction, string> = {
  submit: '提交完成',
  cancel: '取消本次',
  withdraw: '撤回提交，继续做',
  confirm: '确认完成',
  reject: '拒绝',
  resubmit: '重新提交',
}

export default function TaskDetailPage() {
  const { id } = useParams()
  const queryClient = useQueryClient()
  const { user, workspaceHousehold, readOnly } = useSession()
  const householdId = workspaceHousehold?.id ?? ''
  const userId = user?.id ?? ''
  const slot = useRef(createIdempotencySlot())
  const [dialog, setDialog] = useState<DialogKind>(null)
  const [note, setNote] = useState('')
  const [reason, setReason] = useState('')
  const [actionError, setActionError] = useState<string | null>(null)

  const query = useQuery({
    queryKey: queryKeys.task(userId, householdId, id ?? ''),
    queryFn: () => api.getTask(householdId, id!),
    enabled: Boolean(user && householdId && id),
  })

  const task = query.data
  const workerName = workspaceHousehold?.members.find((item) => item.user_id === task?.worker_user_id)?.display_name ?? '执行人'
  const payerName = workspaceHousehold?.members.find((item) => item.user_id === task?.payer_user_id)?.display_name ?? '承担人'
  const actions = task && user && !readOnly ? getTaskActions(task, user.id) : []

  async function refresh() {
    if (user && householdId) await invalidateHouseholdQueries(queryClient, user.id, householdId)
    await query.refetch()
  }

  const mutation = useMutation({
    mutationFn: async (kind: Exclude<DialogKind, null>) => {
      if (!id) throw new Error('任务不存在')
      const key = slot.current.key()
      if (kind === 'submit' || kind === 'resubmit') return api.submitTask(householdId, id, note || undefined, key)
      if (kind === 'withdraw') return api.withdrawTask(householdId, id, key)
      if (kind === 'cancel') return api.cancelTask(householdId, id, key)
      if (kind === 'confirm') return api.confirmTask(householdId, id, key)
      return api.rejectTask(householdId, id, reason.trim(), key)
    },
    onSuccess: async () => {
      slot.current.rotate()
      setDialog(null)
      setActionError(null)
      setReason('')
      await refresh()
      Toast.show({ content: '已更新' })
    },
    onError: async (err) => {
      setActionError(errorMessage(err))
      await query.refetch()
    },
  })

  if (query.isLoading) {
    return (
      <main className="page">
        <h1>家务详情</h1>
        <ListSkeleton />
      </main>
    )
  }
  if (query.error || !task) {
    return (
      <main className="page">
        <h1>家务详情</h1>
        <ErrorRetry error={query.error ?? new Error('任务不存在')} onRetry={() => void query.refetch()} />
      </main>
    )
  }

  const confirmCopy: Record<Exclude<DialogKind, null>, { title: string; description: string; person?: string; amount?: number; danger?: boolean; reason?: boolean }> = {
    submit: { title: '提交完成', description: '提交后等待对方确认，确认前不会记入应付工资。' },
    resubmit: { title: '重新提交', description: '将按同一条家务、同一锁定金额再次提交，等待对方确认。' },
    withdraw: { title: '撤回提交，继续做', description: '任务会回到进行中。这不是撤销已确认或已拒绝的结果。' },
    cancel: { title: '取消本次', description: '取消后不产生工资，且不能恢复。', danger: true },
    confirm: {
      title: '确认完成',
      description: '确认后将记一笔应付工资。此操作不能撤销。',
      person: workerName,
      amount: task.unit_price_fen_snapshot,
    },
    reject: {
      title: '拒绝完工',
      description: '本次不入账。执行人可以改说明后，再提交同一条家务。',
      reason: true,
      danger: true,
    },
  }

  return (
    <main className="page">
      <h1 className="break">{task.name_snapshot}</h1>
      <div className="card">
        <div className="row">
          <AmountText fen={task.unit_price_fen_snapshot} />
          <StatusTag kind="task" status={task.status} />
        </div>
        <p>执行人：{workerName}</p>
        <p>承担人：{payerName}</p>
        <p className="muted">开始于 {formatDateTime(task.started_at)}</p>
        {task.note ? <p>说明：{task.note}</p> : null}
        {task.reject_reason && task.status === 'rejected' ? <p>拒绝原因：{task.reject_reason}</p> : null}
        {task.wage ? <p className="muted">已入账工资 {formatFen(task.wage.amount_fen)}（{task.wage.status === 'payable' ? '待付款' : task.wage.status === 'awaiting_receipt' ? '待确认收款' : '已结清'}）</p> : (
          task.status === 'pending_confirm' ? <p className="muted">确认后才计入应付工资</p> : null
        )}
      </div>

      <div className="section-title">审核历史</div>
      <div className="card">
        {task.review_events.length === 0 ? <p className="muted">还没有提交或审核记录</p> : null}
        {task.review_events.map((event) => (
          <p key={event.id} className="muted">
            {formatDateTime(event.created_at)} · {labelAction(event.action)}
            {event.reason ? `：${event.reason}` : ''}
          </p>
        ))}
      </div>

      {(actions.includes('submit') || actions.includes('resubmit')) && (
        <div className="card" style={{ marginTop: 12 }}>
          <label>
            说明（可选）
            <TextArea value={note} onChange={setNote} rows={3} maxLength={200} showCount placeholder="可写完成情况" />
          </label>
        </div>
      )}

      {actions.length > 0 ? (
        <div className="bottom-actions" style={{ display: 'grid', gap: 8 }}>
          {actions.map((action) => (
            <Button
              key={action}
              className="tap-btn"
              color={action === 'reject' || action === 'cancel' ? 'danger' : 'primary'}
              fill={action === 'withdraw' || action === 'cancel' || action === 'reject' ? 'outline' : 'solid'}
              block
              disabled={mutation.isPending}
              onClick={() => {
                setActionError(null)
                setDialog(action)
              }}
            >
              {ACTION_LABEL[action]}
            </Button>
          ))}
        </div>
      ) : null}

      {dialog ? (
        <ConfirmActionDialog
          open
          title={confirmCopy[dialog].title}
          description={confirmCopy[dialog].description}
          person={confirmCopy[dialog].person}
          amountFen={confirmCopy[dialog].amount}
          confirmLabel={ACTION_LABEL[dialog]}
          danger={confirmCopy[dialog].danger}
          reasonRequired={confirmCopy[dialog].reason}
          reason={reason}
          reasonPlaceholder="没做完 / 做的不是这项"
          onReasonChange={setReason}
          loading={mutation.isPending}
          error={actionError ?? undefined}
          onConfirm={() => mutation.mutate(dialog)}
          onClose={() => !mutation.isPending && setDialog(null)}
        />
      ) : null}
    </main>
  )
}

function labelAction(action: string) {
  if (action === 'submit') return '提交完成'
  if (action === 'withdraw') return '撤回提交'
  if (action === 'confirm') return '确认完成'
  if (action === 'reject') return '拒绝完工'
  return action
}
