import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Toast } from 'antd-mobile'
import { api } from '../api/resources'
import { queryKeys } from '../api/queryKeys'
import { createIdempotencySlot } from '../api/idempotency'
import { useSession } from '../auth/SessionProvider'
import { ConfirmActionDialog } from '../components/ConfirmActionDialog'
import { PwaHint } from '../components/PwaHint'
import { errorMessage } from '../components/ErrorRetry'
import { formatDateTime } from '../datetime/format'
import { ApiRequestError } from '../api/errors'

export default function MePage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { user, activeHousehold, workspaceHousehold, households, refreshSession, logout } = useSession()
  const unbindSlot = useRef(createIdempotencySlot())
  const regenSlot = useRef(createIdempotencySlot())
  const [unbindOpen, setUnbindOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loggingOut, setLoggingOut] = useState(false)

  const inviteQuery = useQuery({
    queryKey: user ? queryKeys.invitesCurrent(user.id) : ['invites', 'idle'],
    queryFn: () => api.getCurrentInvite(),
    enabled: Boolean(user && !activeHousehold),
  })
  const invite = inviteQuery.data?.invite
  const visibleCode = invite?.status === 'pending' && invite.code ? invite.code : null
  const partner = (activeHousehold ?? workspaceHousehold)?.members.find((item) => item.user_id !== user?.id)

  const unbind = useMutation({
    mutationFn: () => api.unbindHousehold(activeHousehold!.id, unbindSlot.current.key()),
    onSuccess: async () => {
      unbindSlot.current.rotate()
      setUnbindOpen(false)
      await refreshSession()
      Toast.show({ content: '已解绑，历史只读' })
    },
    onError: (err) => {
      setError(errorMessage(err))
      if (err instanceof ApiRequestError && err.code === 'UNBIND_BLOCKED') {
        setUnbindOpen(false)
      }
    },
  })

  const regenerate = useMutation({
    mutationFn: () => api.regenerateInvite(regenSlot.current.key()),
    onSuccess: () => {
      regenSlot.current.rotate()
      if (user) void queryClient.invalidateQueries({ queryKey: queryKeys.invitesCurrent(user.id) })
    },
    onError: (err) => setError(errorMessage(err)),
  })

  const cancelInvite = useMutation({
    mutationFn: () => api.cancelCurrentInvite(),
    onSuccess: () => {
      if (user) void queryClient.invalidateQueries({ queryKey: queryKeys.invitesCurrent(user.id) })
    },
    onError: (err) => setError(errorMessage(err)),
  })

  async function onLogout() {
    setLoggingOut(true)
    try {
      await logout()
      navigate('/login', { replace: true })
    } finally {
      setLoggingOut(false)
    }
  }

  return (
    <main className="page">
      <h1>我的</h1>
      <div className="card">
        <p style={{ marginTop: 0 }}>
          <strong>{user?.display_name}</strong>
        </p>
        <p className="muted">账号 {user?.username}</p>
        {partner ? <p>关联对象：{partner.display_name}</p> : <p className="muted">尚未关联对象</p>}
        {activeHousehold ? <p className="muted">当前家庭有效</p> : workspaceHousehold ? <p className="muted">当前没有有效绑定，下方历史只读</p> : null}
      </div>

      {!activeHousehold ? (
        <>
          <div className="section-title">邀请关联</div>
          <div className="card">
            {visibleCode ? (
              <>
                <p className="amount" style={{ letterSpacing: '0.12em' }}>{visibleCode}</p>
                <p className="muted">有效期至 {formatDateTime(invite!.expires_at)}</p>
                <div style={{ display: 'grid', gap: 8 }}>
                  <Button className="tap-btn" color="primary" block onClick={() => void navigator.clipboard.writeText(visibleCode).then(() => Toast.show({ content: '邀请码已复制' }))}>
                    复制邀请码
                  </Button>
                  <Button className="tap-btn" fill="outline" block loading={regenerate.isPending} onClick={() => regenerate.mutate()}>
                    重新生成
                  </Button>
                  <Button className="tap-btn" fill="outline" block loading={cancelInvite.isPending} onClick={() => cancelInvite.mutate()}>
                    作废邀请
                  </Button>
                </div>
              </>
            ) : (
              <Button className="tap-btn" color="primary" block onClick={() => navigate('/pair')}>
                去关联
              </Button>
            )}
          </div>
        </>
      ) : null}

      {households.filter((item) => item.status === 'dissolved').length > 0 ? (
        <>
          <div className="section-title">历史家庭</div>
          {households.filter((item) => item.status === 'dissolved').map((item) => (
            <div className="card" key={item.id}>
              <p style={{ margin: 0 }}>已解绑 · {item.members.map((member) => member.display_name).join(' / ')}</p>
              <Button fill="outline" size="small" style={{ marginTop: 8 }} onClick={() => navigate('/ledger')}>
                查看只读账本
              </Button>
            </div>
          ))}
        </>
      ) : null}

      <div className="section-title">添加到主屏幕</div>
      <PwaHint />
      <p className="muted">用 iPhone 的 Safari 打开，分享 → 添加到主屏幕。不依赖推送提醒。</p>

      {activeHousehold ? (
        <div className="bottom-actions" style={{ display: 'grid', gap: 8 }}>
          <Button className="tap-btn" color="danger" fill="outline" block onClick={() => { setError(null); setUnbindOpen(true) }}>
            解绑
          </Button>
        </div>
      ) : null}

      {error ? <p className="field-error">{error}</p> : null}

      <Button className="tap-btn" block fill="outline" loading={loggingOut} disabled={loggingOut} onClick={() => void onLogout()} style={{ marginTop: 16 }}>
        退出登录
      </Button>

      <ConfirmActionDialog
        open={unbindOpen}
        title="解绑"
        description="有进行中、待确认或已拒绝（仍可重提）的家务，或待付款、待收款确认的工资时不能解绑。撤回提交后只要任务还在进行中，也仍然不能解绑。全部结清后解绑，旧历史只读，不会带到新关系。"
        confirmLabel="确认解绑"
        danger
        loading={unbind.isPending}
        error={error ?? undefined}
        onConfirm={() => unbind.mutate()}
        onClose={() => !unbind.isPending && setUnbindOpen(false)}
      />
    </main>
  )
}
