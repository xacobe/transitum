const BASE = import.meta.env.VITE_POCKETBASE_URL ?? '/pb/api'
const TOKEN_KEY = 'pb_admin_token'

interface PbError extends Error {
  status: number
  data: Record<string, unknown>
}

function getToken(): string | null {
  return sessionStorage.getItem(TOKEN_KEY)
}

function setToken(token: string): void {
  sessionStorage.setItem(TOKEN_KEY, token)
}

function clearToken(): void {
  sessionStorage.removeItem(TOKEN_KEY)
}

async function pbFetch(path: string, opts: RequestInit = {}): Promise<unknown> {
  const token = getToken()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(opts.headers as Record<string, string> | undefined),
  }
  if (token) headers['Authorization'] = token

  const res = await fetch(`${BASE}${path}`, { ...opts, headers })
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as Record<string, unknown>
    // Treat 400/401 on authenticated requests as expired token; force re-login
    if (token && (res.status === 400 || res.status === 401)) {
      clearToken()
    }
    const err = Object.assign(
      new Error((body.message as string) || `HTTP ${res.status}`),
      { status: res.status, data: body },
    ) as PbError
    throw err
  }
  if (res.status === 204) return null  // No Content (DELETE)
  return res.json()
}

export async function pbAdminAuth(email: string, password: string): Promise<unknown> {
  const data = await pbFetch('/collections/_superusers/auth-with-password', {
    method: 'POST',
    body: JSON.stringify({ identity: email, password }),
  }) as { token: string }
  setToken(data.token)
  return data
}

export function pbIsAuthenticated(): boolean {
  return !!getToken()
}

export function pbLogout(): void {
  clearToken()
}

export function pbGet<T = unknown>(path: string, params: Record<string, string> = {}): Promise<T> {
  const qs = new URLSearchParams(params).toString()
  return pbFetch(`${path}${qs ? '?' + qs : ''}`) as Promise<T>
}

export async function pbVerifyAuth(): Promise<boolean> {
  try {
    await pbGet('/collections/reports/records', { perPage: '1' })
    return true
  } catch (e) {
    const err = e as { status?: number }
    // 400 alongside 401/403: PocketBase returns 400, not 401, for an expired
    // superuser token on some rule configurations (see reports collection's
    // listRule/viewRule) - pbFetch already treats it as "expired" and clears
    // the token; this must agree, or a stale token reads as "still logged in".
    if (err.status === 400 || err.status === 401 || err.status === 403) {
      clearToken()
      return false
    }
    return true // network/server error — preserve current auth state
  }
}

export function pbPost<T = unknown>(path: string, body: unknown): Promise<T> {
  return pbFetch(path, { method: 'POST', body: JSON.stringify(body) }) as Promise<T>
}

export function pbPatch<T = unknown>(path: string, body: unknown): Promise<T> {
  return pbFetch(path, { method: 'PATCH', body: JSON.stringify(body) }) as Promise<T>
}

export function pbDelete(path: string): Promise<null> {
  return pbFetch(path, { method: 'DELETE' }) as Promise<null>
}
