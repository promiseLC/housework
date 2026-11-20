export function createIdempotencyKey(): string {
  return crypto.randomUUID()
}

export function createIdempotencySlot() {
  let current = createIdempotencyKey()
  return {
    key() {
      return current
    },
    rotate() {
      current = createIdempotencyKey()
      return current
    },
  }
}

export type IdempotencySlot = ReturnType<typeof createIdempotencySlot>
