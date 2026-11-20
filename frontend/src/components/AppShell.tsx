import type { ReactNode } from 'react'
import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useSession } from '../auth/SessionProvider'
import { invalidateUserQueries } from '../hooks/invalidate'
import { BottomNav } from './BottomNav'

export function AppShell({ children }: { children: ReactNode }) {
  const { user } = useSession()
  const queryClient = useQueryClient()

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === 'visible' && user) {
        void invalidateUserQueries(queryClient, user.id)
      }
    }
    document.addEventListener('visibilitychange', refresh)
    window.addEventListener('focus', refresh)
    return () => {
      document.removeEventListener('visibilitychange', refresh)
      window.removeEventListener('focus', refresh)
    }
  }, [queryClient, user])

  return (
    <div className="app-shell">
      {children}
      <BottomNav />
    </div>
  )
}
