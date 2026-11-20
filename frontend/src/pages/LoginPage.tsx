import { useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button, Input } from 'antd-mobile'
import { api } from '../api/resources'
import { createIdempotencySlot } from '../api/idempotency'
import { useSession } from '../auth/SessionProvider'
import { validatePassword } from '../auth/validation'
import { errorMessage } from '../components/ErrorRetry'
import { ApiRequestError } from '../api/errors'

export default function LoginPage() {
  const { applyAuth } = useSession()
  const navigate = useNavigate()
  const slot = useRef(createIdempotencySlot())
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    const pwdError = validatePassword(password)
    setPasswordError(pwdError)
    if (!username.trim()) {
      setFormError('请输入账号')
      return
    }
    if (pwdError) return
    setFormError(null)
    setLoading(true)
    try {
      const tokens = await api.login({ username: username.trim(), password }, slot.current.key())
      slot.current.rotate()
      await applyAuth(tokens)
      navigate(tokens.user ? '/pair' : '/login', { replace: true })
      // applyAuth + guards will send paired users to /chores
    } catch (error) {
      setFormError(error instanceof ApiRequestError ? error.message : errorMessage(error))
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="safe-screen page">
      <h1>登录</h1>
      <p className="muted">使用自设账号和密码登录，无需手机号。</p>
      <form onSubmit={onSubmit} className="card" style={{ display: 'grid', gap: 12 }}>
        <label>
          账号
          <Input value={username} onChange={setUsername} placeholder="请输入账号" autoComplete="username" />
        </label>
        <label>
          密码
          <Input type="password" value={password} onChange={setPassword} placeholder="请输入密码" autoComplete="current-password" />
          {passwordError ? <div className="field-error">{passwordError}</div> : null}
        </label>
        {formError ? <div className="field-error">{formError}</div> : null}
        <Button className="tap-btn" color="primary" block type="submit" loading={loading} disabled={loading}>
          登录
        </Button>
      </form>
      <p style={{ marginTop: 16 }}>
        还没有账号？<Link to="/register">去注册</Link>
      </p>
    </main>
  )
}
