import type { TokenPair } from '../api/types'

const STORAGE_KEY = 'household-pay.tokens'

function read(): TokenPair | null {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as TokenPair
    if (parsed.access_token && parsed.refresh_token) return parsed
    return null
  } catch {
    return null
  }
}

export const tokenStore = {
  getAccessToken(): string | null {
    return read()?.access_token ?? null
  },
  getRefreshToken(): string | null {
    return read()?.refresh_token ?? null
  },
  setTokens(tokens: TokenPair): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tokens))
  },
  clear(): void {
    localStorage.removeItem(STORAGE_KEY)
  },
}
