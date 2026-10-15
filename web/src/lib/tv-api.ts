import { getAccessToken } from "@/lib/auth-api"

export type TVDraft = {
  tmdbId: string
  title: string
  season: number
  enabled: boolean
  channels: string[]
  match: string
  exclude: string
}
export type TVResource = {
  title: string
  url: string
  cloud: string
  channel: string
  password?: string
  size: number
  episode: number
}
export type TVSubscription = TVDraft & {
  id: string
  poster: string
  episodes: Array<{ number: number; name: string; airDate: string }>
  resources: TVResource[]
  lastCheckedAt: string
  nextCheckAt: string
  lastError: string
  metadataError: string
}
async function request<T>(
  path = "",
  method = "GET",
  body?: unknown,
  signal?: AbortSignal
): Promise<T> {
  const token = getAccessToken()
  const response = await fetch(`/api/v1/subscriptions/tv${path}`, {
    method,
    signal,
    cache: "no-store",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (response.status === 204) return undefined as T
  const data = await response.json().catch(() => null)
  if (!response.ok) throw new Error(data?.message ?? "追剧请求失败")
  if (data === null) throw new Error("追剧服务返回了无效响应")
  return data as T
}
export const tvApi = {
  list: (signal?: AbortSignal) =>
    request<TVSubscription[]>("", "GET", undefined, signal),
  create: (d: TVDraft) => request<TVSubscription>("", "POST", d),
  update: (id: string, d: TVDraft) =>
    request<TVSubscription>(`/${encodeURIComponent(id)}`, "PUT", d),
  remove: (id: string) => request<void>(`/${encodeURIComponent(id)}`, "DELETE"),
  refresh: (id: string) =>
    request<TVSubscription>(`/${encodeURIComponent(id)}/refresh`, "POST"),
}
