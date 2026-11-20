import { useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Input, Toast } from 'antd-mobile'
import { api } from '../api/resources'
import { queryKeys } from '../api/queryKeys'
import { createIdempotencySlot } from '../api/idempotency'
import { useSession } from '../auth/SessionProvider'
import { fenToYuanString, yuanStringToFen } from '../money/fen'
import { errorMessage } from '../components/ErrorRetry'
import { invalidateHouseholdQueries } from '../hooks/invalidate'

const NAME_SUGGESTIONS = ['换床单被罩', '洗碗', '扫地', '拖地']

export default function ChoreTypeFormPage() {
  const { id } = useParams()
  const isEdit = Boolean(id)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { user, workspaceHousehold, readOnly } = useSession()
  const slot = useRef(createIdempotencySlot())
  const householdId = workspaceHousehold?.id ?? ''

  const types = useQuery({
    queryKey: user && householdId ? queryKeys.choreTypes(user.id, householdId) : ['choreTypes', 'idle'],
    queryFn: () => api.listChoreTypes(householdId, true),
    enabled: Boolean(user && householdId && isEdit),
  })

  const current = types.data?.items.find((item) => item.id === id)
  const [name, setName] = useState('')
  const [yuan, setYuan] = useState('')
  const [error, setError] = useState<string | null>(null)

  useMemo(() => {
    if (current && !name && !yuan) {
      setName(current.name)
      setYuan(fenToYuanString(current.unit_price_fen))
    }
    return current
  }, [current, name, yuan])

  const save = useMutation({
    mutationFn: async () => {
      const parsed = yuanStringToFen(yuan)
      if (!parsed.ok) throw new Error(parsed.error)
      if (!name.trim()) throw new Error('请填写家务名称')
      if (isEdit && id) return api.updateChoreType(householdId, id, { name: name.trim(), unit_price_fen: parsed.fen })
      return api.createChoreType(householdId, { name: name.trim(), unit_price_fen: parsed.fen }, slot.current.key())
    },
    onSuccess: async () => {
      slot.current.rotate()
      if (user && householdId) await invalidateHouseholdQueries(queryClient, user.id, householdId)
      Toast.show({ content: isEdit ? '已保存' : '已添加' })
      navigate('/chores')
    },
    onError: (err) => setError(errorMessage(err)),
  })

  if (readOnly) {
    return (
      <main className="page">
        <h1>{isEdit ? '编辑家务' : '新增家务'}</h1>
        <p className="muted">当前家庭已解绑，不能再改模板。</p>
      </main>
    )
  }

  return (
    <main className="page">
      <h1>{isEdit ? '编辑家务' : '新增家务'}</h1>
      {isEdit ? <p className="hint">改价只影响以后新开始的家务，已开始的记录不变。</p> : (
        <p className="muted">可参考常用名称，工资必须自己填写，不会预填金额。</p>
      )}
      <div className="card" style={{ display: 'grid', gap: 12, marginTop: 12 }}>
        <label>
          名称
          <Input value={name} onChange={setName} placeholder="例如：洗碗" maxLength={40} />
        </label>
        {!isEdit ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {NAME_SUGGESTIONS.map((item) => (
              <Button key={item} size="mini" fill="outline" onClick={() => setName(item)}>
                {item}
              </Button>
            ))}
          </div>
        ) : null}
        <label>
          每次金额（元）
          <Input value={yuan} onChange={setYuan} placeholder="例如 8 或 12.34" inputMode="decimal" type="text" />
        </label>
        {error ? <div className="field-error">{error}</div> : null}
        <Button className="tap-btn" color="primary" block loading={save.isPending} disabled={save.isPending} onClick={() => save.mutate()}>
          {isEdit ? '保存' : '添加'}
        </Button>
      </div>
    </main>
  )
}
