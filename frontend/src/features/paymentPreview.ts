import type { PaymentPreview } from '../api/types'

export type PreviewMatch = { ok: true } | { ok: false; reason: string }

export function assertPreviewMatchesSelection(
  preview: PaymentPreview,
  wageIds: string[],
): PreviewMatch {
  if (preview.total_amount_fen < 1) {
    return { ok: false, reason: '合计金额无效，请重新预览' }
  }
  if (preview.wage_count !== wageIds.length) {
    return { ok: false, reason: '预览笔数与勾选不一致，请重新预览' }
  }
  const selected = new Set(wageIds)
  const previewIds = new Set(preview.items.map((item) => item.wage_id))
  if (selected.size !== previewIds.size) {
    return { ok: false, reason: '预览明细与勾选不一致，请重新预览' }
  }
  for (const id of selected) {
    if (!previewIds.has(id)) {
      return { ok: false, reason: '预览明细与勾选不一致，请重新预览' }
    }
  }
  return { ok: true }
}
