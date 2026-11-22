export class ApiError extends Error {
  status: number
  data: unknown
  constructor(status: number, data: unknown) {
    super(extractMessage(data) ?? `Request failed (${status})`)
    this.status = status
    this.data = data
  }
  /** DRF field errors: { field: ["msg"] } */
  get fieldErrors(): Record<string, string> {
    const out: Record<string, string> = {}
    if (this.data && typeof this.data === 'object') {
      for (const [k, v] of Object.entries(this.data as Record<string, unknown>)) {
        if (k === 'detail') continue
        out[k] = Array.isArray(v) ? String(v[0]) : String(v)
      }
    }
    return out
  }
}

function extractMessage(data: unknown): string | undefined {
  if (data && typeof data === 'object') {
    const d = data as Record<string, unknown>
    if (typeof d.detail === 'string') return d.detail
    const first = Object.values(d)[0]
    if (first) return Array.isArray(first) ? String(first[0]) : String(first)
  }
}

function getCookie(name: string) {
  return document.cookie.split('; ').find((c) => c.startsWith(name + '='))?.split('=')[1]
}

export async function ensureCsrf() {
  if (!getCookie('csrftoken')) await fetch('/api/v1/auth/csrf/', { credentials: 'same-origin' })
}

export async function api<T = unknown>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const method = opts.method ?? 'GET'
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (method !== 'GET') {
    await ensureCsrf()
    headers['X-CSRFToken'] = decodeURIComponent(getCookie('csrftoken') ?? '')
  }
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json'
  const res = await fetch(path, {
    method,
    headers,
    credentials: 'same-origin',
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  })
  if (res.status === 204) return undefined as T
  const data = await res.json().catch(() => null)
  if (!res.ok) throw new ApiError(res.status, data)
  return data as T
}

export const tenantPath = (slug: string, p: string) => `/api/v1/c/${slug}/${p}`
