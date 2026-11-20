import { Navigate, Route, Routes } from 'react-router-dom'
import { GuestOnly, RequireActiveHousehold, RequireAuth } from './guards'
import LoginPage from '../pages/LoginPage'
import RegisterPage from '../pages/RegisterPage'
import PairPage from '../pages/PairPage'
import ChoresPage from '../pages/ChoresPage'
import ChoreTypeFormPage from '../pages/ChoreTypeFormPage'
import TaskDetailPage from '../pages/TaskDetailPage'
import LedgerPage from '../pages/LedgerPage'
import NewPaymentPage from '../pages/NewPaymentPage'
import PaymentDetailPage from '../pages/PaymentDetailPage'
import MePage from '../pages/MePage'
import { useSession } from '../auth/SessionProvider'

function PairRoute() {
  const { activeHousehold } = useSession()
  if (activeHousehold) return <Navigate to="/chores" replace />
  return (
    <RequireAuth>
      <PairPage />
    </RequireAuth>
  )
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<GuestOnly><LoginPage /></GuestOnly>} />
      <Route path="/register" element={<GuestOnly><RegisterPage /></GuestOnly>} />
      <Route path="/pair" element={<PairRoute />} />
      <Route path="/chores" element={<RequireAuth><ChoresPage /></RequireAuth>} />
      <Route path="/chores/new" element={<RequireActiveHousehold><ChoreTypeFormPage /></RequireActiveHousehold>} />
      <Route path="/chores/:id/edit" element={<RequireActiveHousehold><ChoreTypeFormPage /></RequireActiveHousehold>} />
      <Route path="/tasks/:id" element={<RequireAuth><TaskDetailPage /></RequireAuth>} />
      <Route path="/ledger" element={<RequireAuth><LedgerPage /></RequireAuth>} />
      <Route path="/payments/new" element={<RequireActiveHousehold><NewPaymentPage /></RequireActiveHousehold>} />
      <Route path="/payments/:id" element={<RequireAuth><PaymentDetailPage /></RequireAuth>} />
      <Route path="/me" element={<RequireAuth><MePage /></RequireAuth>} />
      <Route path="/" element={<Navigate to="/chores" replace />} />
      <Route path="*" element={<Navigate to="/chores" replace />} />
    </Routes>
  )
}
