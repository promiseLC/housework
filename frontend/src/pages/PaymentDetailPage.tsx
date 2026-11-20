import { useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Toast } from 'antd-mobile'
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
import { invalidateHouseholdQueries } from '../hooks/invalidate'
import { formatFen } from '../money/fen'

export default function PaymentDetailPage() {
  const { id } = useParams()
  const queryClient = useQueryClient()
  const { user, workspaceHousehold, readOnly } = useSession()
  const householdId = workspaceHousehold?.id ?? ''
  const userId = user?.id ?? ''
  const slot = useRef(createIdempotencySlot())
  const [dialog, setDialog] = useState<'confirm' | 'reject' | null>(null)
  const [reason, setReason] = useState('')
  const [actionError, setActionError] = useState<string | null>(null)

  const query = useQuery({
    queryKey: queryKeys.payment(userId, householdId, id ?? ''),
    queryFn: () => api.getPayment(householdId, id!),
    enabled: Boolean(user && householdId && id),
  })

  const payment = query.data
  const payerName = workspaceHousehold?.members.find((item) => item.user_id === payment?.payer_user_id)?.display_name ?? '付款人'
  const payeeName = workspaceHousehold?.members.find((item) => item.user_id === payment?.payee_user_id)?.display_name ?? '收款人'
  const isPayee = Boolean(user && payment && user.id === payment.payee_user_id)
  const canAct = Boolean(!readOnly && isPayee && payment?.status === 'awaiting_receipt')

  const mutation = useMutation({
    mutationFn: async (kind: 'confirm' | 'reject') => {
      if (!id) throw new Error('结算单不存在')
      if (kind === 'confirm') return api.confirmPaymentReceived(householdId, id, slot.current.key())
      return api.rejectPaymentReceived(householdId, id, reason.trim(), slot.current.key())
    },
    onSuccess: async () => {
      slot.current.rotate()
      setDialog(null)
      await invalidateHouseholdQueries(queryClient, userId, householdId)
      await query.refetch()
      Toast.show({ content: '已更新' })
    },
    onError: async (error) => {
      setActionError(errorMessage(error))
      await query.refetch()
    },
  })

  if (query.isLoading) {
    return (
      <main className="page">
        <h1>结算单</h1>
        <ListSkeleton />
      </main>
    )
  }
  if (query.error || !payment) {
    return (
      <main className="page">
        <h1>结算单</h1>
        <ErrorRetry error={query.error ?? new Error('结算单不存在')} onRetry={() => void query.refetch()} />
      </main>
    )
  }

  return (
    <main className="page">
      <h1>结算单</h1>
      <div className="card">
        <div className="row">
          <AmountText fen={payment.total_amount_fen} />
          <StatusTag kind="payment" status={payment.status} />
        </div>
        <p>付款人：{payerName}</p>
        <p>收款人：{payeeName}</p>
        <p className="muted">标记付款时间 {formatDateTime(payment.marked_paid_at)}</p>
        {payment.settled_at ? <p className="muted">结清时间 {formatDateTime(payment.settled_at)}</p> : null}
        {payment.reject_reason ? <p>拒绝原因：{payment.reject_reason}</p> : null}
        <div className="section-title">明细</div>
        <ul>
          {payment.items.map((item) => (
            <li key={item.wage_id}>
              {item.chore_name || '家务'} · {formatFen(item.amount_fen)}
            </li>
          ))}
        </ul>
        {payment.status === 'awaiting_receipt' ? <p className="muted">这还不是结清，需收款人确认已收款。</p> : null}
      </div>

      {canAct ? (
        <div className="bottom-actions" style={{ display: 'grid', gap: 8 }}>
          <Button className="tap-btn" color="primary" block disabled={mutation.isPending} onClick={() => { setActionError(null); setDialog('confirm') }}>
            确认已收款
          </Button>
          <Button className="tap-btn" color="danger" fill="outline" block disabled={mutation.isPending} onClick={() => { setActionError(null); setDialog('reject') }}>
            未到账，拒绝
          </Button>
        </div>
      ) : null}

      <ConfirmActionDialog
        open={dialog === 'confirm'}
        title="确认已收款"
        description={`确认已收到${payerName}付来的合计。确认后结清，不能撤销。`}
        person={payerName}
        amountFen={payment.total_amount_fen}
        confirmLabel="确认已收款"
        loading={mutation.isPending}
        error={actionError ?? undefined}
        onConfirm={() => mutation.mutate('confirm')}
        onClose={() => !mutation.isPending && setDialog(null)}
      />
      <ConfirmActionDialog
        open={dialog === 'reject'}
        title="未到账，拒绝"
        description="本结算单将保留，工资回到待付款，可重新结算。这不是撤销结清。"
        person={payerName}
        amountFen={payment.total_amount_fen}
        confirmLabel="未到账拒绝"
        danger
        reasonRequired
        reason={reason}
        reasonPlaceholder="尚未收到这笔钱"
        onReasonChange={setReason}
        loading={mutation.isPending}
        error={actionError ?? undefined}
        onConfirm={() => mutation.mutate('reject')}
        onClose={() => !mutation.isPending && setDialog(null)}
      />
    </main>
  )
}
