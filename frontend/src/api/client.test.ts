import { http, HttpResponse } from 'msw/http'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from 'vitest'
import { apiRequest, configureApiClient } from './client'
import { tokenStore } from '../auth/tokenStore'

const server = setupServer()

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => {
  server.resetHandlers()
  tokenStore.clear()
})
afterAll(() => server.close())

describe('apiRequest', () => {
  test('sends Idempotency-Key on state-changing posts but not on payment preview', async () => {
    const seen: Array<{ url: string; key: string | null }> = []
    server.use(
      http.post('*/api/v1/households/:id/payments/preview', ({ request }) => {
        seen.push({ url: request.url, key: request.headers.get('Idempotency-Key') })
        return HttpResponse.json({
          payer: { id: 'u1', username: 'a', display_name: 'A' },
          payee: { id: 'u2', username: 'b', display_name: 'B' },
          items: [{ wage_id: 'w1', amount_fen: 100 }],
          total_amount_fen: 100,
          wage_count: 1,
        })
      }),
      http.post('*/api/v1/households/:id/payments', ({ request }) => {
        seen.push({ url: request.url, key: request.headers.get('Idempotency-Key') })
        return HttpResponse.json({ id: 'p1', status: 'awaiting_receipt' }, { status: 201 })
      }),
    )
    tokenStore.setTokens({ access_token: 'access', refresh_token: 'refresh' })
    await apiRequest('/households/h1/payments/preview', {
      method: 'POST',
      body: { wage_ids: ['w1'] },
    })
    await apiRequest('/households/h1/payments', {
      method: 'POST',
      body: { wage_ids: ['w1'] },
      idempotencyKey: 'idem-1234',
    })
    expect(seen[0].key).toBeNull()
    expect(seen[1].key).toBe('idem-1234')
  })

  test('refreshes on 401 and retries the original request with the same idempotency key', async () => {
    let confirmCalls = 0
    const keys: string[] = []
    server.use(
      http.post('*/api/v1/households/:hid/tasks/:tid/confirm', ({ request }) => {
        confirmCalls += 1
        const auth = request.headers.get('Authorization')
        const key = request.headers.get('Idempotency-Key') ?? ''
        keys.push(key)
        if (auth === 'Bearer old-access') {
          return HttpResponse.json({ error: { code: 'UNAUTHORIZED', message: '未登录' } }, { status: 401 })
        }
        return HttpResponse.json({ id: 't1', status: 'confirmed' })
      }),
      http.post('*/api/v1/auth/refresh', async ({ request }) => {
        const body = (await request.json()) as { refresh_token: string }
        expect(body.refresh_token).toBe('old-refresh')
        return HttpResponse.json({
          access_token: 'new-access',
          refresh_token: 'new-refresh',
          token_type: 'bearer',
          expires_in: 3600,
          user: { id: 'u1', username: 'a', display_name: 'A' },
        })
      }),
    )
    tokenStore.setTokens({ access_token: 'old-access', refresh_token: 'old-refresh' })
    const result = await apiRequest<{ status: string }>('/households/h1/tasks/t1/confirm', {
      method: 'POST',
      idempotencyKey: 'confirm-key-1',
    })
    expect(result.status).toBe('confirmed')
    expect(confirmCalls).toBe(2)
    expect(keys).toEqual(['confirm-key-1', 'confirm-key-1'])
    expect(tokenStore.getAccessToken()).toBe('new-access')
  })

  test('calls onAuthLost and clears tokens when refresh fails', async () => {
    let lost = 0
    configureApiClient({ onAuthLost: () => { lost += 1 } })
    server.use(
      http.get('*/api/v1/me', () =>
        HttpResponse.json({ error: { code: 'UNAUTHORIZED', message: '未登录' } }, { status: 401 }),
      ),
      http.post('*/api/v1/auth/refresh', () =>
        HttpResponse.json({ error: { code: 'UNAUTHORIZED', message: '刷新失败' } }, { status: 401 }),
      ),
    )
    tokenStore.setTokens({ access_token: 'old-access', refresh_token: 'old-refresh' })
    await expect(apiRequest('/me')).rejects.toMatchObject({ code: 'UNAUTHORIZED', status: 401 })
    expect(lost).toBe(1)
    expect(tokenStore.getAccessToken()).toBeNull()
    configureApiClient({ onAuthLost: undefined })
  })

  test('blocks write requests when offline and does not hit the network', async () => {
    const spy = vi.fn()
    server.use(http.post('*/api/v1/households/:id/payments', spy))
    tokenStore.setTokens({ access_token: 'access', refresh_token: 'refresh' })
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false })
    await expect(
      apiRequest('/households/h1/payments', { method: 'POST', body: { wage_ids: ['w1'] }, idempotencyKey: 'idem-5678' }),
    ).rejects.toMatchObject({ code: 'OFFLINE', message: '目前没有网络，账目需联网同步' })
    expect(spy).not.toHaveBeenCalled()
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true })
  })
})
