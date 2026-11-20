import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Checkbox, Toast } from 'antd-mobile'
import { api } from '../api/resources'
import { queryKeys } from '../api/queryKeys'
import { createIdempotencySlot } from '../api/idempotency'
import { useSession } from '../auth/SessionProvider'
import { AmountText } from '../components/AmountText'
import { ConfirmActionDialog } from '../components/ConfirmActionDialog'
import { EmptyState } from '../components/EmptyState'
import { ErrorRetry, errorMessage } from '../components/ErrorRetry'
import { ListSkeleton } from '../components/ListSkeleton'
import { assertPreviewMatchesSelection } from '../features/paymentPreview'
import { invalidateHouseholdQueries } from '../hooks/invalidate'
import { formatFen } from '../money/fen'
import type { PaymentPreview } from '../api/types'

export default function NewPaymentPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { user, workspaceHousehold, readOnly } = useSession()
  const householdId = workspaceHousehold?.id ?? ''
  const userId = user?.id ?? ''
  const slot = useRef(createIdempotencySlot())
  const [selected, setSelected] = useState<string[]>([])
  const [preview, setPreview] = useState<PaymentPreview | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const wages = useQuery({
    queryKey: queryKeys.wages(userId, householdId, { status: 'payable', direction: 'payable' }),
    queryFn: () => api.listWages(householdId, { status: 'payable', direction: 'payable' }),
    enabled: Boolean(user && householdId),
  })

  useEffect(() => {
    const ids = wages.data?.items.map((item) => item.id) ?? []
    setSelected((current) => current.filter((id) => ids.includes(id)))
  }, [wages.data])

  const localTotal = useMemo(
    () => (wages.data?.items ?? []).filter((item) => selected.includes(item.id)).reduce((sum, item) => sum + item.amount_fen, 0),
    [wages.data, selected],
  )

  useEffect(() => {
    let cancelled = false
    async function run() {
      if (selected.length === 0) {
        setPreview(null)
        return
      }
      try {
        const result = await api.previewPayment(householdId, selected)
        if (!cancelled) {
          setPreview(result)
          setPreviewError(null)
        }
      } catch (error) {
        if (!cancelled) {
          setPreview(null)
          setPreviewError(errorMessage(error))
        }
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [householdId, selected])

  const create = useMutation({
    mutationFn: async () => {
      const latest = await api.previewPayment(householdId, selected)
      setPreview(latest)
      const match = assertPreviewMatchesSelection(latest, selected)
      if (!match.ok) throw new Error(match.reason)
      return api.createPayment(householdId, selected, slot.current.key())
    },
    onSuccess: async (payment) => {
      slot.current.rotate()
      setConfirmOpen(false)
      await invalidateHouseholdQueries(queryClient, userId, householdId)
      Toast.show({ content: '已标记付款，待对方确认收款' })
      navigate(`/payments/${payment.id}`, { replace: true })
    },
    onError: async (error) => {
      setPreviewError(errorMessage(error))
      await wages.refetch()
      if (selected.length) {
        try {
          setPreview(await api.previewPayment(householdId, selected))
        } catch (previewErr) {
          setPreview(null)
          setPreviewError(errorMessage(previewErr))
        }
      }
    },
  })

  if (readOnly) {
    return (
      <main className="page">
        <h1>标记已付款</h1>
        <p className="muted">当前家庭只读，不能再结算。</p>
      </main>
    )
  }
  if (wages.isLoading) {
    return (
      <main className="page">
        <h1>标记已付款</h1>
        <ListSkeleton />
      </main>
    )
  }
  if (wages.error) {
    return (
      <main className="page">
        <h1>标记已付款</h1>
        <ErrorRetry error={wages.error} onRetry={() => void wages.refetch()} />
      </main>
    )
  }

  const items = wages.data?.items ?? []
  if (items.length === 0) {
    return (
      <main className="page">
        <h1>标记已付款</h1>
        <EmptyState title="没有可付款的工资" action={<Button onClick={() => navigate('/ledger')}>返回账本</Button>} />
      </main>
    )
  }

  const displayTotal = preview?.total_amount_fen ?? localTotal
  const payeeName = preview?.payee.display_name ?? '对方'
  const canSubmit = selected.length > 0 && preview !== null && preview.total_amount_fen > 0 && !previewError

  return (
    <main className="page">
      <h1>标记已付款</h1>
      <p className="muted">先线下把合计付给对方，再在这里标记「已付款」。只能勾选整笔、同方向的待付款工资，不能拆分，也不能对冲对方欠你的钱。</p>
      <div className="card">
        {items.map((wage) => (
          <label key={wage.id} className="row" style={{ minHeight: 44, padding: '8px 0' }}>
            <Checkbox
              checked={selected.includes(wage.id)}
              onChange={(checked) => {
                setSelected((current) => (checked ? [...current, wage.id] : current.filter((id) => id !== wage.id)))
              }}
            >
              {wage.chore_name || '家务'} · {formatFen(wage.amount_fen)}
            </Checkbox>
          </label>
        ))}
      </div>
      <div className="card">
        <div className="muted">付款预览（以后端为准）</div>
        {preview ? (
          <>
            <p>
              付款人：{preview.payer.display_name} → 收款人：{preview.payee.display_name}
            </p>
            <ul className="muted">
              {preview.items.map((item) => (
                <li key={item.wage_id}>
                  {item.chore_name || '家务'} · {formatFen(item.amount_fen)}
                </li>
              ))}
            </ul>
            <div>
              合计 <AmountText fen={preview.total_amount_fen} size="sm" />
            </div>
          </>
        ) : (
          <p className="muted">{selected.length ? '正在预览…' : '请勾选至少一笔工资'}</p>
        )}
        {previewError ? <p className="field-error" role="alert">{previewError}</p> : null}
      </div>
      <div className="bottom-actions">
        <Button
          className="tap-btn"
          color="primary"
          block
          disabled={!canSubmit || create.isPending}
          onClick={() => setConfirmOpen(true)}
        >
          我已线下付款
        </Button>
      </div>
      <ConfirmActionDialog
        open={confirmOpen}
        title="我已线下付款"
        description={`请确认已把下列合计线下付给${payeeName}。提交后进入待确认收款，不能自行撤回，也还没有结清。`}
        person={payeeName}
        amountFen={displayTotal}
        details={preview?.items.map((item) => `${item.chore_name || '家务'} ${formatFen(item.amount_fen)}`)}
        confirmLabel="我已线下付款"
        loading={create.isPending}
        error={previewError ?? undefined}
        onConfirm={() => create.mutate()}
        onClose={() => !create.isPending && setConfirmOpen(false)}
      />
    </main>
  )
}
