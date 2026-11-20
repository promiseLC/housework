const FEN_MAX = 100_000_000

export type FenParseResult =
  | { ok: true; fen: number }
  | { ok: false; error: string }

export function yuanStringToFen(input: string): FenParseResult {
  const raw = input.trim()
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(raw)) {
    return { ok: false, error: '请输入最多两位小数的正数金额' }
  }
  const [integerPart, fractionPart = ''] = raw.split('.')
  const fen = Number(integerPart) * 100 + Number(fractionPart.padEnd(2, '0'))
  if (!Number.isInteger(fen) || fen < 1 || fen > FEN_MAX) {
    return { ok: false, error: '金额须为正整数分，且不超过上限' }
  }
  return { ok: true, fen }
}

export function fenToYuanString(fen: number): string {
  const sign = fen < 0 ? '-' : ''
  const abs = Math.abs(fen)
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`
}

export function formatFen(fen: number): string {
  return `¥${fenToYuanString(fen)}`
}
