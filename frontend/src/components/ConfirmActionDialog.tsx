import { Button, TextArea } from 'antd-mobile'
import { AmountText } from './AmountText'

export function ConfirmActionDialog({
  open,
  title,
  description,
  person,
  amountFen,
  details,
  confirmLabel,
  danger = false,
  reasonRequired = false,
  reason = '',
  reasonPlaceholder,
  onReasonChange,
  loading,
  error,
  onConfirm,
  onClose,
}: {
  open: boolean
  title: string
  description: string
  person?: string
  amountFen?: number
  details?: string[]
  confirmLabel: string
  danger?: boolean
  reasonRequired?: boolean
  reason?: string
  reasonPlaceholder?: string
  onReasonChange?: (value: string) => void
  loading?: boolean
  error?: string
  onConfirm: () => void
  onClose: () => void
}) {
  if (!open) return null
  const disabled = loading || (reasonRequired && !reason.trim())
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 80,
        background: 'rgba(15,20,30,0.45)',
        display: 'flex',
        alignItems: 'flex-end',
      }}
    >
      <div
        className="card"
        style={{
          width: '100%',
          borderRadius: '20px 20px 0 0',
          padding: '18px 16px calc(16px + var(--safe-bottom))',
        }}
      >
        <h2 id="confirm-title" style={{ margin: '0 0 8px', fontSize: 18 }}>
          {title}
        </h2>
        <p className="muted" style={{ marginTop: 0 }}>
          {description}
        </p>
        {person ? (
          <p>
            对象：<span className="person">{person}</span>
          </p>
        ) : null}
        {amountFen !== undefined ? (
          <p>
            金额：<AmountText fen={amountFen} size="sm" />
          </p>
        ) : null}
        {details?.length ? (
          <ul className="muted" style={{ paddingLeft: 18 }}>
            {details.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        ) : null}
        {reasonRequired ? (
          <TextArea
            placeholder={reasonPlaceholder}
            value={reason}
            onChange={onReasonChange}
            rows={3}
            maxLength={200}
            showCount
          />
        ) : null}
        {error ? <p className="field-error">{error}</p> : null}
        <div className="bottom-actions" style={{ display: 'grid', gap: 8 }}>
          <Button
            className="tap-btn"
            color={danger ? 'danger' : 'primary'}
            block
            loading={loading}
            disabled={disabled}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
          <Button className="tap-btn" fill="outline" block disabled={loading} onClick={onClose}>
            取消
          </Button>
        </div>
      </div>
    </div>
  )
}
