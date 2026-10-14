export type AuthUser = {
  id: string
  account: string
  name: string
  email: string
  avatar: string
}

type AuthResponse = {
  accessToken: string
  user: AuthUser
}

const TOKEN_KEY = "frame.mockAccessToken"
const API_PREFIX = "/api/auth"

export function storeAccessToken(accessToken: string) {
  sessionStorage.setItem(TOKEN_KEY, accessToken)
}

export function getAccessToken() {
  return sessionStorage.getItem(TOKEN_KEY)
}

async function readError(response: Response) {
  const body = (await response.json().catch(() => null)) as
    | { message?: string }
    | null
  return body?.message ?? "请求失败，请稍后重试。"
}

export async function login(account: string, password: string) {
  const response = await fetch(`${API_PREFIX}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ account, password }),
  })

  if (!response.ok) {
    throw new Error(await readError(response))
  }

  const session = (await response.json()) as AuthResponse
  storeAccessToken(session.accessToken)
  return session.user
}

export async function getSetupStatus() {
  const response = await fetch(`${API_PREFIX}/setup/status`)
  if (!response.ok) throw new Error(await readError(response))
  return response.json() as Promise<{ setupRequired: boolean }>
}

export async function setup(account: string, password: string) {
  const response = await fetch(`${API_PREFIX}/setup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ account, password }),
  })
  if (!response.ok) throw new Error(await readError(response))
  const session = (await response.json()) as AuthResponse
  storeAccessToken(session.accessToken)
  return session.user
}

async function authenticatedRequest(path: string, body: unknown, method: "PATCH" | "POST") {
  const token = getAccessToken()
  const response = await fetch(`${API_PREFIX}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  })
  if (!response.ok) throw new Error(await readError(response))
  return response.json() as Promise<AuthUser | AuthResponse>
}

export function updateAccount(account: string, currentPassword: string) {
  return authenticatedRequest("/account", { account, currentPassword }, "PATCH") as Promise<AuthUser>
}

export async function changePassword(currentPassword: string, newPassword: string) {
  const result = await authenticatedRequest("/password", { currentPassword, newPassword }, "POST") as AuthResponse
  storeAccessToken(result.accessToken)
  return result.user
}

export async function getCurrentUser() {
  const token = sessionStorage.getItem(TOKEN_KEY)
  const response = await fetch(`${API_PREFIX}/me`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  })

  if (!response.ok) {
    sessionStorage.removeItem(TOKEN_KEY)
    throw new Error(await readError(response))
  }

  return (await response.json()) as AuthUser
}

export async function logout() {
  const token = sessionStorage.getItem(TOKEN_KEY)

  try {
    const response = await fetch(`${API_PREFIX}/logout`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    })

    if (!response.ok) {
      throw new Error(await readError(response))
    }
  } finally {
    sessionStorage.removeItem(TOKEN_KEY)
  }
}
