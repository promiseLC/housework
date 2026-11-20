import type { ReactNode } from 'react'

export function EmptyState({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="card" style={{ textAlign: 'center', padding: 24 }}>
      <p className="muted" style={{ margin: '0 0 12px' }}>
        {title}
      </p>
      {action}
    </div>
  )
}
