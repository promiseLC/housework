import { ApiRequestError } from '../api/errors'

export const OFFLINE_MESSAGE = '目前没有网络，账目需联网同步'

export function isOnline() {
  return typeof navigator === 'undefined' ? true : navigator.onLine
}

export function assertOnline() {
  if (!isOnline()) {
    throw new ApiRequestError({ code: 'OFFLINE', message: OFFLINE_MESSAGE, status: 0 })
  }
}
