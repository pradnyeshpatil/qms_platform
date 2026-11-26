/** Shape of every API error: {code, message, detail, fields, request_id} (backend `apps/core/exceptions.py`). */
export type ErrorBody = {
  code?: string
  message?: string
  detail?: string
  fields?: Record<string, string[] | string>
  request_id?: string
}

export class ApiError extends Error {
  status: number
  data: unknown
  code: string
  requestId: string
  constructor(status: number, data: unknown) {
    super(extractMessage(data) ?? `Request failed (${status})`)
    this.status = status
    this.data = data
    const body = (data && typeof data === 'object' ? data : {}) as ErrorBody
    this.code = typeof body.code === 'string' ? body.code : ''
    this.requestId = typeof body.request_id === 'string' ? body.request_id : ''
  }
  /** Per-field messages (first message of each field). Falls back to the pre-envelope `{field: [msg]}` shape. */
  get fieldErrors(): Record<string, string> {
    const out: Record<string, string> = {}
    if (!this.data || typeof this.data !== 'object') return out
    const body = this.data as Record<string, unknown>
    const source = 'fields' in body && body.fields && typeof body.fields === 'object' ? (body.fields as Record<string, unknown>) : isEnvelope(body) ? {} : body
    for (const [k, v] of Object.entries(source)) {
      if (k === 'detail') continue
      out[k] = Array.isArray(v) ? String(v[0]) : String(v)
    }
    return out
  }
  /** True when the message is the generic "fix the fields" one and the form should show field errors instead. */
  get isFieldValidation(): boolean {
    return this.code === 'validation_error' && Object.keys(this.fieldErrors).length > 0
  }
}

const isEnvelope = (d: Record<string, unknown>) => 'message' in d && 'code' in d

function extractMessage(data: unknown): string | undefined {
  if (data && typeof data === 'object') {
    const d = data as Record<string, unknown>
    if (typeof d.message === 'string' && d.message) return d.message
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

/** multipart upload with progress (fetch cannot report upload progress, XHR can). */
export async function upload<T = unknown>(path: string, form: FormData, onProgress?: (fraction: number) => void): Promise<T> {
  await ensureCsrf()
  return new Promise<T>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', path)
    xhr.withCredentials = true
    xhr.setRequestHeader('Accept', 'application/json')
    xhr.setRequestHeader('X-CSRFToken', decodeURIComponent(getCookie('csrftoken') ?? ''))
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total)
    xhr.onerror = () => reject(new ApiError(0, { message: 'Network error. Check your connection and try again.' }))
    xhr.onload = () => {
      let data: unknown = null
      try { data = JSON.parse(xhr.responseText) } catch { /* empty body */ }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data as T)
      else reject(new ApiError(xhr.status, data))
    }
    xhr.send(form)
  })
}

export const tenantPath = (slug: string, p: string) => `/api/v1/c/${slug}/${p}`

/** Query string from a record, skipping empty values. */
export function qs(params: Record<string, string | number | boolean | null | undefined>): string {
  const u = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v !== '' && v !== null && v !== undefined && v !== false) u.set(k, String(v))
  const s = u.toString()
  return s ? `?${s}` : ''
}
