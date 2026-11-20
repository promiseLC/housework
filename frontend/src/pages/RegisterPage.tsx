import { useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button, Input } from 'antd-mobile'
import { api } from '../api/resources'
import { createIdempotencySlot } from '../api/idempotency'
import { useSession } from '../auth/SessionProvider'
import { validateDisplayName, validatePassword, validateUsername } from '../auth/validation'
import { errorMessage } from '../components/ErrorRetry'
import { ApiRequestError } from '../api/errors'

export default function RegisterPage() {
  const { applyAuth } = useSession()
  const navigate = useNavigate()
  const slot = useRef(createIdempotencySlot())
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    const next = {
      username: validateUsername(username) ?? '',
      displayName: validateDisplayName(displayName) ?? '',
      password: validatePassword(password) ?? '',
    }
    setErrors(next)
    if (next.username || next.displayName || next.password) return
    setFormError(null)
    setLoading(true)
    try {
      const tokens = await api.register(
        { username: username.trim(), password, display_name: displayName.trim() },
        slot.current.key(),
      )
      slot.current.rotate()
      await applyAuth(tokens)
      navigate('/pair', { replace: true })
    } catch (error) {
      setFormError(error instanceof ApiRequestError ? error.message : errorMessage(error))
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="safe-screen page">
      <h1>注册</h1>
      <p className="muted">设置唯一账号、显示名和密码。不做短信验证。</p>
      <form onSubmit={onSubmit} className="card" style={{ display: 'grid', gap: 12 }}>
        <label>
          账号
          <Input value={username} onChange={setUsername} placeholder="2–32 位字母、数字、下划线或中文" autoComplete="username" />
          {errors.username ? <div className="field-error">{errors.username}</div> : null}
        </label>
        <label>
          显示名
          <Input value={displayName} onChange={setDisplayName} placeholder="1–20 个字" />
          {errors.displayName ? <div className="field-error">{errors.displayName}</div> : null}
        </label>
        <label>
          密码
          <Input type="password" value={password} onChange={setPassword} placeholder="8–72 位" autoComplete="new-password" />
          {errors.password ? <div className="field-error">{errors.password}</div> : null}
        </label>
        {formError ? <div className="field-error">{formError}</div> : null}
        <Button className="tap-btn" color="primary" block type="submit" loading={loading} disabled={loading}>
          注册
        </Button>
      </form>
      <p style={{ marginTop: 16 }}>
        已有账号？<Link to="/login">去登录</Link>
      </p>
    </main>
  )
}
