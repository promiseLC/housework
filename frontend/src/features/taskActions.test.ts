import { describe, expect, test } from 'vitest'
import { getTaskActions } from './taskActions'
import type { Task } from '../api/types'

const worker = 'worker-1'
const payer = 'payer-1'

function task(status: Task['status'], extra: Partial<Task> = {}): Task {
  return {
    id: 't1',
    household_id: 'h1',
    chore_type_id: 'c1',
    name_snapshot: '洗碗',
    unit_price_fen_snapshot: 500,
    worker_user_id: worker,
    payer_user_id: payer,
    status,
    started_at: '2026-11-20T00:00:00Z',
    version: 1,
    ...extra,
  }
}

describe('getTaskActions', () => {
  test('lets the worker submit or cancel an in-progress task', () => {
    expect(getTaskActions(task('in_progress'), worker)).toEqual(['submit', 'cancel'])
    expect(getTaskActions(task('in_progress'), payer)).toEqual([])
  })

  test('lets the worker withdraw and the payer confirm or reject pending work', () => {
    expect(getTaskActions(task('pending_confirm'), worker)).toEqual(['withdraw'])
    expect(getTaskActions(task('pending_confirm'), payer)).toEqual(['confirm', 'reject'])
  })

  test('does not let a worker confirm their own task', () => {
    expect(getTaskActions(task('pending_confirm'), worker)).not.toContain('confirm')
    expect(getTaskActions(task('pending_confirm'), worker)).not.toContain('reject')
  })

  test('lets the worker resubmit a rejected task and keeps history-only for the payer', () => {
    expect(getTaskActions(task('rejected'), worker)).toEqual(['resubmit'])
    expect(getTaskActions(task('rejected'), payer)).toEqual([])
  })

  test('hides all mutating actions after confirm or cancel, including any undo', () => {
    expect(getTaskActions(task('confirmed'), worker)).toEqual([])
    expect(getTaskActions(task('confirmed'), payer)).toEqual([])
    expect(getTaskActions(task('cancelled'), worker)).toEqual([])
    const actions = [
      ...getTaskActions(task('confirmed'), worker),
      ...getTaskActions(task('confirmed'), payer),
    ]
    expect(actions.some((item) => item.includes('undo') || item.includes('revoke'))).toBe(false)
  })
})
