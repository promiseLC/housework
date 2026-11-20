import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { configureApiClient } from '../api/client'
import { api } from '../api/resources'
import type { AuthTokenResponse, HouseholdSummary, UserPublic } from '../api/types'
import { clearClientState } from './session'
import { tokenStore } from './tokenStore'

type SessionValue = {
  bootstrapping: boolean
  user: UserPublic | null
  activeHousehold: HouseholdSummary | null
  households: HouseholdSummary[]
  workspaceHousehold: HouseholdSummary | null
  readOnly: boolean
  refreshSession: () => Promise<void>
  applyAuth: (tokens: AuthTokenResponse) => Promise<void>
  logout: () => Promise<void>
}

const SessionContext = createContext<SessionValue | null>(null)

export function SessionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [bootstrapping, setBootstrapping] = useState(true)
  const [user, setUser] = useState<UserPublic | null>(null)
  const [activeHousehold, setActiveHousehold] = useState<HouseholdSummary | null>(null)
  const [households, setHouseholds] = useState<HouseholdSummary[]>([])

  const refreshSession = useCallback(async () => {
    if (!tokenStore.getAccessToken()) {
      setUser(null)
      setActiveHousehold(null)
      setHouseholds([])
      return
    }
    const me = await api.getMe()
    setUser(me.user)
    setActiveHousehold(me.active_household)
    const list = await api.listHouseholds()
    setHouseholds(list.items)
  }, [])

  useEffect(() => {
    configureApiClient({
      onAuthLost: () => {
        clearClientState(queryClient)
        setUser(null)
        setActiveHousehold(null)
        setHouseholds([])
      },
    })
    void (async () => {
      try {
        await refreshSession()
      } catch {
        clearClientState(queryClient)
        setUser(null)
        setActiveHousehold(null)
        setHouseholds([])
      } finally {
        setBootstrapping(false)
      }
    })()
  }, [queryClient, refreshSession])

  const applyAuth = useCallback(
    async (tokens: AuthTokenResponse) => {
      clearClientState(queryClient)
      tokenStore.setTokens({
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_in: tokens.expires_in,
      })
      setUser(tokens.user)
      await refreshSession()
    },
    [queryClient, refreshSession],
  )

  const logout = useCallback(async () => {
    const refresh = tokenStore.getRefreshToken()
    try {
      if (refresh) await api.logout(refresh)
    } catch {
      // Local logout still proceeds so a failed network call cannot keep a stale session.
    }
    clearClientState(queryClient)
    setUser(null)
    setActiveHousehold(null)
    setHouseholds([])
  }, [queryClient])

  const workspaceHousehold = useMemo(() => {
    if (activeHousehold) return activeHousehold
    return households.find((item) => item.status === 'dissolved') ?? households[0] ?? null
  }, [activeHousehold, households])

  const readOnly = !activeHousehold || workspaceHousehold?.status === 'dissolved'

  const value = useMemo(
    () => ({
      bootstrapping,
      user,
      activeHousehold,
      households,
      workspaceHousehold,
      readOnly,
      refreshSession,
      applyAuth,
      logout,
    }),
    [bootstrapping, user, activeHousehold, households, workspaceHousehold, readOnly, refreshSession, applyAuth, logout],
  )

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession() {
  const value = useContext(SessionContext)
  if (!value) throw new Error('useSession must be used within SessionProvider')
  return value
}
