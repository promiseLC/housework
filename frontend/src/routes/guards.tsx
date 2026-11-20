import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useSession } from '../auth/SessionProvider'
import { AppShell } from '../components/AppShell'

export function BootGate({ children }: { children: ReactNode }) {
  const { bootstrapping } = useSession()
  if (bootstrapping) {
    return (
      <main className="safe-screen page">
        <p className="muted">正在进入…</p>
      </main>
    )
  }
  return children
}

export function GuestOnly({ children }: { children: ReactNode }) {
  const { user, activeHousehold } = useSession()
  if (user && activeHousehold) return <Navigate to="/chores" replace />
  if (user) return <Navigate to="/pair" replace />
  return children
}

export function RequireAuth({ children, shell = true }: { children: ReactNode; shell?: boolean }) {
  const { user } = useSession()
  if (!user) return <Navigate to="/login" replace />
  return shell ? <AppShell>{children}</AppShell> : children
}

export function RequireActiveHousehold({ children }: { children: ReactNode }) {
  const { user, activeHousehold } = useSession()
  if (!user) return <Navigate to="/login" replace />
  if (!activeHousehold) return <Navigate to="/pair" replace />
  return <AppShell>{children}</AppShell>
}
