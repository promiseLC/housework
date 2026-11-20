import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, PullToRefresh, Tabs } from 'antd-mobile'
import { api } from '../api/resources'
import { queryKeys } from '../api/queryKeys'
import { useSession } from '../auth/SessionProvider'
import { AmountText } from '../components/AmountText'
import { EmptyState } from '../components/EmptyState'
import { ErrorRetry } from '../components/ErrorRetry'
import { ListSkeleton } from '../components/ListSkeleton'
import { StatusTag } from '../components/StatusTag'
import { invalidateHouseholdQueries } from '../hooks/invalidate'
import { formatFen } from '../money/fen'

export default function LedgerPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { user, workspaceHousehold, activeHousehold, readOnly } = useSession()
  const householdId = workspaceHousehold?.id ?? ''
  const userId = user?.id ?? ''
  const enabled = Boolean(user && householdId)

  const summary = useQuery({
    queryKey: queryKeys.ledgerSummary(userId, householdId),
    queryFn: () => api.getLedgerSummary(householdId),
    enabled,
  })
  const pendingTasks = useQuery({
    queryKey: queryKeys.tasks(userId, householdId, { status: 'pending_confirm' }),
    queryFn: () => api.listTasks(householdId, { status: 'pending_confirm' }),
    enabled,
  })
  const payableMine = useQuery({
    queryKey: queryKeys.wages(userId, householdId, { status: 'payable', direction: 'payable' }),
    queryFn: () => api.listWages(householdId, { status: 'payable', direction: 'payable' }),
    enabled,
  })
  const payableTheirs = useQuery({
    queryKey: queryKeys.wages(userId, householdId, { status: 'payable', direction: 'receivable' }),
    queryFn: () => api.listWages(householdId, { status: 'payable', direction: 'receivable' }),
    enabled,
  })
  const awaitingPayments = useQuery({
    queryKey: queryKeys.payments(userId, householdId, { status: 'awaiting_receipt' }),
    queryFn: () => api.listPayments(householdId, { status: 'awaiting_receipt' }),
    enabled,
  })
  const settledPayments = useQuery({
    queryKey: queryKeys.payments(userId, householdId, { status: 'settled' }),
    queryFn: () => api.listPayments(householdId, { status: 'settled' }),
    enabled,
  })
  const rejectedPayments = useQuery({
    queryKey: queryKeys.payments(userId, householdId, { status: 'rejected' }),
    queryFn: () => api.listPayments(householdId, { status: 'rejected' }),
    enabled,
  })

  async function refresh() {
    if (enabled) await invalidateHouseholdQueries(queryClient, userId, householdId)
  }

  if (!workspaceHousehold) {
    return (
      <main className="page">
        <h1>账本</h1>
        <EmptyState title="开始并确认完工后会出现账目" action={<Button color="primary" onClick={() => navigate('/chores')}>去家务</Button>} />
      </main>
    )
  }

  const queries = [summary, pendingTasks, payableMine, payableTheirs, awaitingPayments, settledPayments, rejectedPayments]
  const failed = queries.find((item) => item.error)
  const loading = queries.some((item) => item.isLoading)
  const data = summary.data
  const canPay = !readOnly && (data?.payable_by_me_fen ?? 0) > 0

  return (
    <main className="page">
      <PullToRefresh onRefresh={refresh}>
        <h1>账本</h1>
        {activeHousehold ? null : <p className="hint">这是解绑后的只读历史，旧流水不会迁入新关系。</p>}
        {loading ? <ListSkeleton /> : null}
        {failed ? <ErrorRetry error={failed.error} onRetry={() => void refresh()} /> : null}
        {data ? (
          <div className="two-col">
            <div className="card">
              <div className="muted">我应付</div>
              <AmountText fen={data.payable_by_me_fen} />
              <p className="muted">不含待确认完工，也不抵扣对方欠我的钱</p>
            </div>
            <div className="card">
              <div className="muted">对方应付给我</div>
              <AmountText fen={data.payable_to_me_fen} />
              <p className="muted">待确认收款另计 {formatFen(data.awaiting_my_receipt_fen)}</p>
            </div>
          </div>
        ) : null}

        {canPay ? (
          <div className="bottom-actions">
            <Button className="tap-btn" color="primary" block onClick={() => navigate('/payments/new')}>
              去付款
            </Button>
          </div>
        ) : null}

        <Tabs defaultActiveKey="pending" style={{ marginTop: 8 }}>
          <Tabs.Tab title="待确认完工" key="pending">
            <p className="muted">对方或你已提交，确认后才计入应付。</p>
            {(pendingTasks.data?.items ?? []).map((task) => (
              <button key={task.id} type="button" className="card" style={{ width: '100%', textAlign: 'left', border: 0 }} onClick={() => navigate(`/tasks/${task.id}`)}>
                <div className="row">
                  <div>
                    <div>{task.name_snapshot}</div>
                    <AmountText fen={task.unit_price_fen_snapshot} size="sm" />
                  </div>
                  <StatusTag kind="task" status={task.status} />
                </div>
              </button>
            ))}
            {(pendingTasks.data?.items.length ?? 0) === 0 ? <p className="muted">没有待确认完工的家务</p> : null}
          </Tabs.Tab>
          <Tabs.Tab title="待付款" key="payable">
            {[...(payableMine.data?.items ?? []), ...(payableTheirs.data?.items ?? [])].map((wage) => (
              <div key={wage.id} className="card">
                <div className="row">
                  <div>
                    <div>{wage.chore_name || '家务'}</div>
                    <AmountText fen={wage.amount_fen} size="sm" />
                    <div className="muted">{wage.payer_user_id === userId ? '我应付' : '对方应付给我'}</div>
                  </div>
                  <StatusTag kind="wage" status={wage.status} />
                </div>
              </div>
            ))}
            {(payableMine.data?.items.length ?? 0) + (payableTheirs.data?.items.length ?? 0) === 0 ? <p className="muted">没有待付款工资</p> : null}
          </Tabs.Tab>
          <Tabs.Tab title="待确认收款" key="awaiting">
            <p className="muted">已标记线下付款，收款人确认后才算结清。</p>
            {(awaitingPayments.data?.items ?? []).map((payment) => (
              <button key={payment.id} type="button" className="card" style={{ width: '100%', textAlign: 'left', border: 0 }} onClick={() => navigate(`/payments/${payment.id}`)}>
                <div className="row">
                  <AmountText fen={payment.total_amount_fen} size="sm" />
                  <StatusTag kind="payment" status={payment.status} />
                </div>
              </button>
            ))}
            {(awaitingPayments.data?.items.length ?? 0) === 0 ? <p className="muted">没有待确认收款的结算单</p> : null}
          </Tabs.Tab>
          <Tabs.Tab title="已结清" key="settled">
            {(settledPayments.data?.items ?? []).map((payment) => (
              <button key={payment.id} type="button" className="card" style={{ width: '100%', textAlign: 'left', border: 0 }} onClick={() => navigate(`/payments/${payment.id}`)}>
                <div className="row">
                  <AmountText fen={payment.total_amount_fen} size="sm" />
                  <StatusTag kind="payment" status={payment.status} />
                </div>
              </button>
            ))}
            {(settledPayments.data?.items.length ?? 0) === 0 ? <p className="muted">还没有已结清记录</p> : null}
          </Tabs.Tab>
          <Tabs.Tab title="已拒绝结算" key="rejected">
            <p className="muted">被拒绝的结算单保留作审计，所含工资会回到待付款。</p>
            {(rejectedPayments.data?.items ?? []).map((payment) => (
              <button key={payment.id} type="button" className="card" style={{ width: '100%', textAlign: 'left', border: 0 }} onClick={() => navigate(`/payments/${payment.id}`)}>
                <div className="row">
                  <div>
                    <AmountText fen={payment.total_amount_fen} size="sm" />
                    {payment.reject_reason ? <div className="muted">{payment.reject_reason}</div> : null}
                  </div>
                  <StatusTag kind="payment" status={payment.status} />
                </div>
              </button>
            ))}
            {(rejectedPayments.data?.items.length ?? 0) === 0 ? <p className="muted">没有已拒绝的结算单</p> : null}
          </Tabs.Tab>
        </Tabs>
      </PullToRefresh>
    </main>
  )
}
