import { Button } from 'antd-mobile'
import { ApiRequestError } from '../api/errors'

export function errorMessage(error: unknown) {
  if (error instanceof ApiRequestError) return error.message
  if (error instanceof Error && error.message) return error.message
  return '加载失败，请重试'
}

export function ErrorRetry({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <div className="card">
      <p style={{ marginTop: 0 }}>{errorMessage(error)}</p>
      <Button className="tap-btn" color="primary" fill="outline" onClick={onRetry} block>
        重试
      </Button>
    </div>
  )
}
