import { ApiRequestError, parseApiError } from './errors'
import { tokenStore } from '../auth/tokenStore'
import { assertOnline } from '../net/online'
import type { AuthTokenResponse } from './types'

export const NETWORK_ERROR_MESSAGE = '目前没有网络，账目需联网同步'

type AuthLostHandler = () => void

let onAuthLostHandler: AuthLostHandler | undefined
let refreshInFlight: Promise<boolean> | null = null

export function configureApiClient(options: { onAuthLost?: AuthLostHandler }) {
  onAuthLostHandler = options.onAuthLost
}

export function getApiBaseUrl() {
  return import.meta.env.VITE_API_BASE_URL || '/api/v1'
}

type QueryValue = string | number | boolean | undefined

export type ApiRequestOptions = {
  method?: string
  body?: unknown
  idempotencyKey?: string
  auth?: boolean
  query?: Record<string, QueryValue>
  skipRefresh?: boolean
}

function buildUrl(path: string, query?: Record<string, QueryValue>) {
  const base = getApiBaseUrl().replace(/\/$/, '')
  const normalized = path.startsWith('/') ? path : `/${path}`
  const url = new URL(`${base}${normalized}`, 'http://local.invalid')
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined) continue
      url.searchParams.set(key, String(value))
    }
  }
  return `${url.pathname}${url.search}`
}

function isPreviewPath(path: string) {
  return /\/payments\/preview\/?$/.test(path)
}

function shouldSendIdempotency(method: string, path: string, key?: string) {
  return Boolean(key) && method === 'POST' && !isPreviewPath(path)
}

async function parseBody(response: Response): Promise<unknown> {
  if (response.status === 204) return null
  const text = await response.text()
  if (!text) return null
  try {
    return JSON.parse(text) as unknown
  } catch {
    return text
  }
}

function isAuthPath(path: string) {
  return path.startsWith('/auth/')
}

async function refreshTokens(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight
  const refreshToken = tokenStore.getRefreshToken()
  if (!refreshToken) return false

  refreshInFlight = (async () => {
    try {
      const response = await fetch(buildUrl('/auth/refresh'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }),
      })
      const payload = await parseBody(response)
      if (!response.ok) return false
      const tokens = payload as AuthTokenResponse
      if (!tokens?.access_token || !tokens?.refresh_token) return false
      tokenStore.setTokens({
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_in: tokens.expires_in,
      })
      return true
    } catch {
      return false
    } finally {
      refreshInFlight = null
    }
  })()

  return refreshInFlight
}

function loseAuth() {
  tokenStore.clear()
  onAuthLostHandler?.()
}

export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const method = (options.method || 'GET').toUpperCase()
  if (['POST', 'PATCH', 'DELETE', 'PUT'].includes(method)) {
    assertOnline()
  }
  const auth = options.auth ?? !isAuthPath(path)
  const headers: Record<string, string> = {}
  if (options.body !== undefined) headers['Content-Type'] = 'application/json'
  if (auth) {
    const access = tokenStore.getAccessToken()
    if (access) headers.Authorization = `Bearer ${access}`
  }
  if (shouldSendIdempotency(method, path, options.idempotencyKey)) {
    headers['Idempotency-Key'] = options.idempotencyKey as string
  }

  let response: Response
  try {
    response = await fetch(buildUrl(path, options.query), {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    })
  } catch {
    throw new ApiRequestError({ code: 'NETWORK', message: NETWORK_ERROR_MESSAGE, status: 0 })
  }

  if (response.status === 401 && auth && !options.skipRefresh && !path.startsWith('/auth/refresh')) {
    const refreshed = await refreshTokens()
    if (refreshed) {
      return apiRequest<T>(path, { ...options, skipRefresh: true })
    }
    const payload = await parseBody(response)
    const error = parseApiError(payload, 401)
    loseAuth()
    throw new ApiRequestError(error)
  }

  if (response.status === 204) return undefined as T
  const payload = await parseBody(response)
  if (!response.ok) {
    throw new ApiRequestError(parseApiError(payload, response.status))
  }
  return payload as T
}
