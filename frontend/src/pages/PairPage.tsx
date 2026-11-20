import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Input, Toast } from 'antd-mobile'
import { api } from '../api/resources'
import { queryKeys } from '../api/queryKeys'
import { createIdempotencySlot } from '../api/idempotency'
import { useSession } from '../auth/SessionProvider'
import { errorMessage } from '../components/ErrorRetry'
import { formatDateTime } from '../datetime/format'
import { ApiRequestError } from '../api/errors'

export default function PairPage() {
  const { user, refreshSession } = useSession()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const createSlot = useRef(createIdempotencySlot())
  const regenSlot = useRef(createIdempotencySlot())
  const acceptSlot = useRef(createIdempotencySlot())
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)

  const inviteQuery = useQuery({
    queryKey: user ? queryKeys.invitesCurrent(user.id) : ['invites', 'idle'],
    queryFn: () => api.getCurrentInvite(),
    enabled: Boolean(user),
  })

  const invite = inviteQuery.data?.invite
  const visibleCode = invite?.status === 'pending' && invite.code ? invite.code : null

  function afterInviteChange() {
    if (user) void queryClient.invalidateQueries({ queryKey: queryKeys.invitesCurrent(user.id) })
  }

  const create = useMutation({
    mutationFn: async () => {
      setError(null)
      try {
        return await api.createInvite(createSlot.current.key())
      } catch (err) {
        if (err instanceof ApiRequestError && err.status === 409) {
          afterInviteChange()
        }
        throw err
      }
    },
    onSuccess: () => {
      createSlot.current.rotate()
      afterInviteChange()
    },
    onError: (err) => setError(errorMessage(err)),
  })

  const regenerate = useMutation({
    mutationFn: () => api.regenerateInvite(regenSlot.current.key()),
    onSuccess: () => {
      regenSlot.current.rotate()
      afterInviteChange()
    },
    onError: (err) => setError(errorMessage(err)),
  })

  const cancel = useMutation({
    mutationFn: () => api.cancelCurrentInvite(),
    onSuccess: () => afterInviteChange(),
    onError: (err) => setError(errorMessage(err)),
  })

  const accept = useMutation({
    mutationFn: () => api.acceptInvite(code.trim(), acceptSlot.current.key()),
    onSuccess: async () => {
      acceptSlot.current.rotate()
      await refreshSession()
      navigate('/chores', { replace: true })
    },
    onError: (err) => setError(errorMessage(err)),
  })

  const busy = create.isPending || regenerate.isPending || cancel.isPending || accept.isPending

  async function copyCode() {
    if (!visibleCode) return
    await navigator.clipboard.writeText(visibleCode)
    Toast.show({ content: '邀请码已复制' })
  }

  return (
    <main className="page">
      <h1>关联对象</h1>
      <p className="muted">两人分别注册后，一方发出邀请，另一方填写邀请码接受。接受后才可以设置家务。</p>

      <div className="section-title">发起邀请</div>
      <div className="card">
        {visibleCode ? (
          <>
            <p className="muted">邀请码（刷新后仍可查看）</p>
            <p className="amount" style={{ letterSpacing: '0.12em' }}>
              {visibleCode}
            </p>
            <p className="muted">有效期至 {formatDateTime(invite!.expires_at)}</p>
            <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
              <button type="button" className="tap-btn" data-testid="copy-invite-code" disabled={busy} onClick={() => void copyCode()} style={{ minHeight: 44, width: '100%', borderRadius: 8, border: 0, background: '#2b6cff', color: '#fff', fontSize: 16 }}>
                复制邀请码
              </button>
              <Button className="tap-btn" fill="outline" block loading={regenerate.isPending} disabled={busy} onClick={() => regenerate.mutate()}>
                重新生成
              </Button>
              <Button className="tap-btn" fill="outline" color="danger" block loading={cancel.isPending} disabled={busy} onClick={() => cancel.mutate()}>
                作废邀请
              </Button>
            </div>
          </>
        ) : (
          <Button className="tap-btn" color="primary" block loading={create.isPending} disabled={busy} onClick={() => create.mutate()}>
            发起邀请
          </Button>
        )}
      </div>

      <div className="section-title">填写邀请码</div>
      <div className="card" style={{ display: 'grid', gap: 12 }}>
        <Input value={code} onChange={setCode} placeholder="输入对方的邀请码" />
        <Button
          className="tap-btn"
          color="primary"
          block
          loading={accept.isPending}
          disabled={busy || code.trim().length < 6}
          onClick={() => accept.mutate()}
        >
          接受邀请
        </Button>
      </div>
      {error ? <p className="field-error">{error}</p> : null}
    </main>
  )
}
