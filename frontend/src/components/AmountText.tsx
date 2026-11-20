import { formatFen } from '../money/fen'

export function AmountText({ fen, size = 'lg' }: { fen: number; size?: 'lg' | 'sm' }) {
  return <span className={size === 'lg' ? 'amount' : 'amount-sm'}>{formatFen(fen)}</span>
}
