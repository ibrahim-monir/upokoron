import axios from 'axios'

/*
 * One axios instance for the whole app.
 *
 * Auth runs on Sanctum's SPA mode: the browser holds an HttpOnly session
 * cookie it cannot read, so an XSS bug cannot walk away with a credential.
 * That costs one extra round trip -- Laravel needs a CSRF cookie before it
 * will accept a write -- which `ensureCsrfCookie` below handles once and
 * then remembers.
 */
export const api = axios.create({
  baseURL: '/api/v1',
  withCredentials: true,
  withXSRFToken: true,
  headers: {
    Accept: 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
  },
})

let csrfReady = null

export function ensureCsrfCookie() {
  csrfReady ??= axios
    .get('/sanctum/csrf-cookie', { withCredentials: true })
    .catch((error) => {
      // Let the next write retry rather than caching a failure forever.
      csrfReady = null
      throw error
    })

  return csrfReady
}

export function resetCsrfCookie() {
  csrfReady = null
}

// Any request that changes something needs the CSRF cookie in place first.
api.interceptors.request.use(async (config) => {
  const method = (config.method ?? 'get').toLowerCase()

  if (['post', 'put', 'patch', 'delete'].includes(method)) {
    await ensureCsrfCookie()
  }

  return config
})

/**
 * The API answers with one shape everywhere: { message, code?, errors? }.
 * Normalising it here means components never parse an axios error again.
 */
export class ApiError extends Error {
  constructor(response, fallback) {
    const data = response?.data ?? {}

    super(data.message || fallback || 'Something went wrong.')

    this.name = 'ApiError'
    this.status = response?.status ?? 0
    this.code = data.code ?? null
    this.errors = data.errors ?? null
  }

  /** 422 -- the form is wrong and the fields say how. */
  get isValidation() {
    return this.status === 422
  }

  /**
   * 409 -- the input was fine and the business rules still said no:
   * out of stock, closed period, refund exceeds payment. Worth showing
   * differently from a typo.
   */
  get isBusinessRule() {
    return this.status === 409
  }

  get isUnauthenticated() {
    return this.status === 401
  }

  get isForbidden() {
    return this.status === 403
  }

  /** Field errors flattened for react-hook-form's setError. */
  fieldErrors() {
    if (!this.errors) return {}

    return Object.fromEntries(
      Object.entries(this.errors).map(([field, messages]) => [
        field,
        Array.isArray(messages) ? messages[0] : String(messages),
      ]),
    )
  }
}

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 419) {
      // The session expired and took the CSRF token with it.
      resetCsrfCookie()
    }

    return Promise.reject(new ApiError(error.response, error.message))
  },
)

/** Unwraps `{ data: ... }` for endpoints that use an API resource. */
export async function get(url, config) {
  const { data } = await api.get(url, config)
  return data
}

export async function post(url, body, config) {
  const { data } = await api.post(url, body, config)
  return data
}

export async function put(url, body, config) {
  const { data } = await api.put(url, body, config)
  return data
}

export async function del(url, config) {
  const { data } = await api.delete(url, config)
  return data
}
