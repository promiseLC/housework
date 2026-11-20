const TASK_LABEL: Record<string, { text: string; tone: string }> = {
  in_progress: { text: '进行中', tone: 'info' },
  pending_confirm: { text: '待确认完工', tone: 'warn' },
  rejected: { text: '已拒绝', tone: 'danger' },
  confirmed: { text: '已确认', tone: 'ok' },
  cancelled: { text: '已取消', tone: '' },
}

const WAGE_LABEL: Record<string, { text: string; tone: string }> = {
  payable: { text: '待付款', tone: 'warn' },
  awaiting_receipt: { text: '待确认收款', tone: 'info' },
  settled: { text: '已结清', tone: 'ok' },
}

const PAYMENT_LABEL: Record<string, { text: string; tone: string }> = {
  awaiting_receipt: { text: '待确认收款', tone: 'info' },
  settled: { text: '已结清', tone: 'ok' },
  rejected: { text: '已拒绝到账', tone: 'danger' },
}

export function StatusTag({
  kind,
  status,
}: {
  kind: 'task' | 'wage' | 'payment'
  status: string
}) {
  const map = kind === 'task' ? TASK_LABEL : kind === 'wage' ? WAGE_LABEL : PAYMENT_LABEL
  const item = map[status] ?? { text: status, tone: '' }
  return <span className={`status-tag ${item.tone}`.trim()}>{item.text}</span>
}
