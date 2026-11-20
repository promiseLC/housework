import type { Task } from '../api/types'

export type TaskAction = 'submit' | 'cancel' | 'withdraw' | 'confirm' | 'reject' | 'resubmit'

export function getTaskActions(task: Task, currentUserId: string): TaskAction[] {
  const isWorker = task.worker_user_id === currentUserId
  const isPayer = task.payer_user_id === currentUserId
  if (task.status === 'in_progress' && isWorker) return ['submit', 'cancel']
  if (task.status === 'pending_confirm' && isWorker) return ['withdraw']
  if (task.status === 'pending_confirm' && isPayer && !isWorker) return ['confirm', 'reject']
  if (task.status === 'rejected' && isWorker) return ['resubmit']
  return []
}
