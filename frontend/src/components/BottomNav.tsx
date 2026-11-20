import { Badge, TabBar } from 'antd-mobile'
import { BillOutline, FillinOutline, UserOutline } from 'antd-mobile-icons'
import { useLocation, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api/resources'
import { queryKeys } from '../api/queryKeys'
import { useSession } from '../auth/SessionProvider'

export function BottomNav() {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, workspaceHousehold } = useSession()
  const summary = useQuery({
    queryKey: user && workspaceHousehold ? queryKeys.ledgerSummary(user.id, workspaceHousehold.id) : ['ledgerSummary', 'idle'],
    queryFn: () => api.getLedgerSummary(workspaceHousehold!.id),
    enabled: Boolean(user && workspaceHousehold),
  })

  const choreBadge = summary.data?.pending_confirm_as_reviewer_count ?? 0
  const ledgerBadge =
    (summary.data && summary.data.payable_by_me_fen > 0 ? 1 : 0) +
    (summary.data && summary.data.awaiting_my_receipt_fen > 0 ? 1 : 0)

  const active = location.pathname.startsWith('/ledger') || location.pathname.startsWith('/payments')
    ? '/ledger'
    : location.pathname.startsWith('/me') || location.pathname.startsWith('/pair')
      ? '/me'
      : '/chores'

  return (
    <nav className="bottom-nav" aria-label="主导航">
      <TabBar
        activeKey={active}
        onChange={(key) => navigate(key)}
        safeArea={false}
      >
        <TabBar.Item
          key="/chores"
          title="家务"
          icon={<FillinOutline />}
          badge={choreBadge > 0 ? <Badge content={choreBadge} /> : undefined}
        />
        <TabBar.Item
          key="/ledger"
          title="账本"
          icon={<BillOutline />}
          badge={ledgerBadge > 0 ? <Badge content={ledgerBadge} /> : undefined}
        />
        <TabBar.Item key="/me" title="我的" icon={<UserOutline />} />
      </TabBar>
    </nav>
  )
}
