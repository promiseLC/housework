import { http } from 'msw/http'
import { handleApi } from './mockApi'

async function delegate({ request }: { request: Request }) {
  return handleApi(request)
}

export const handlers = [http.all(/\/api\/v1\/.*/, delegate)]
