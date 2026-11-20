export type ApiError = {
  code: string
  message: string
  status: number
  details?: Record<string, unknown>
}

export function parseApiError(payload: unknown, status: number): ApiError {
  if (payload && typeof payload === 'object' && 'error' in payload) {
    const error = (payload as { error?: { code?: unknown; message?: unknown; details?: unknown } }).error
    if (error && typeof error === 'object') {
      const code = typeof error.code === 'string' && error.code ? error.code : 'UNKNOWN'
      const message =
        typeof error.message === 'string' && error.message
          ? error.message
          : '请求失败，请稍后重试'
      const details =
        error.details && typeof error.details === 'object' && !Array.isArray(error.details)
          ? (error.details as Record<string, unknown>)
          : undefined
      return { code, message, status, details }
    }
  }
  return { code: 'UNKNOWN', message: status >= 500 ? '服务暂时不可用，请稍后重试' : '请求失败，请稍后重试', status }
}

export class ApiRequestError extends Error {
  readonly code: string
  readonly status: number
  readonly details?: Record<string, unknown>

  constructor(error: ApiError) {
    super(error.message)
    this.name = 'ApiRequestError'
    this.code = error.code
    this.status = error.status
    this.details = error.details
  }
}
