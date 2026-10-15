import { presentMediaError } from "@/lib/media-presentation"
import type {
  MediaDetail,
  MediaDiscoverQuery,
  MediaPage,
  MediaSummary,
  MediaType,
  MediaSource,
  MediaProvidersResponse,
} from "@/lib/media-contract"
import type { AnimeSubscription } from "@/lib/anime-api"
import type {
  EmbyMediaItem,
  EmbyResumeItem,
  EmbySiteId,
} from "@/mocks/data/emby-dashboard"
import { getAccessToken } from "@/lib/auth-api"

export class MediaApiError extends Error {
  status: number
  retryAfter: string | null
  constructor(status: number, message: string, retryAfter: string | null) {
    super(message)
    this.status = status
    this.retryAfter = retryAfter
  }
}
export function formatMediaError(error: unknown): string {
  if (!(error instanceof MediaApiError))
    return "网络中断，无法连接服务，请检查网络后重试。"
  return presentMediaError(error.status, error.message, error.retryAfter)
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers)
  const token = getAccessToken()
  if (token && !headers.has("Authorization"))
    headers.set("Authorization", `Bearer ${token}`)
  if (init?.body && !headers.has("Content-Type"))
    headers.set("Content-Type", "application/json")
  const response = await fetch(url, { ...init, headers })
  if (!response.ok) {
    const error = (await response.json().catch(() => null)) as {
      message?: string
    } | null
    throw new MediaApiError(
      response.status,
      error?.message ?? `请求失败 (${response.status})`,
      response.headers.get("Retry-After")
    )
  }
  return response.status === 204
    ? (undefined as T)
    : (response.json() as Promise<T>)
}

export type DiscoverApiItem = MediaSummary
export type DiscoverResponse = MediaPage<DiscoverApiItem>
export type RankingsResponse = {
  rankings: Array<{
    source: string
    name: string
    supported: boolean
    available: boolean
    message?: string
    result?: MediaPage<MediaSummary>
  }>
}
export type EmbyDashboardResponse = {
  updatedAt: string
  warnings: string[]
  sites: readonly { id: "all" | EmbySiteId; label: string }[]
  stats: Record<
    "all" | EmbySiteId,
    {
      movies: number
      series: number
      episodes: number
      plays: number
      viewers: number
      hours: number
    }
  >
  libraries: readonly {
    id: string
    title: string
    type: string
    count: number
    siteId: EmbySiteId
  }[]
  recentlyAdded: EmbyMediaItem[]
  continueWatching: EmbyResumeItem[]
}

function fetchDetailRequest(
  source: MediaSource,
  sourceId: string,
  mediaType?: MediaType,
  signal?: AbortSignal
) {
  return request<MediaDetail>(
    `/api/media/${source}/${encodeURIComponent(sourceId)}${mediaType ? `?mediaType=${mediaType}` : ""}`,
    { signal }
  )
}

export const mediaApi = {
  fetchProviders(signal?: AbortSignal) {
    return request<MediaProvidersResponse>("/api/media/providers", { signal })
  },
  discover(query: MediaDiscoverQuery, signal?: AbortSignal) {
    const params = new URLSearchParams(
      Object.entries(query)
        .filter(([, value]) => value !== undefined)
        .map(([key, value]) => [key, String(value)] as [string, string])
    )
    return request<DiscoverResponse>(`/api/media/discover?${params}`, {
      signal,
    })
  },
  fetchDetail: fetchDetailRequest,
  detail: fetchDetailRequest,
  rankings(signal?: AbortSignal, source?: string, name?: string) {
    const params = new URLSearchParams()
    if (source) params.set("source", source)
    if (name) params.set("name", name)
    return request<RankingsResponse>(`/api/media/rankings?${params}`, {
      signal,
    })
  },
  rankingPlatforms(mediaType: string, region: string, signal?: AbortSignal) {
    return request<{ items: { id: number; name: string; logo: string }[] }>(
      `/api/media/rankings/platforms?${new URLSearchParams({ mediaType, region })}`,
      { signal }
    )
  },
  animeSubscriptions() {
    return request<AnimeSubscription[]>("/api/subscriptions/anime")
  },
  updateAnimeSubscription(
    id: string,
    patch: Pick<AnimeSubscription, "status">
  ) {
    return request<AnimeSubscription>(
      `/api/subscriptions/anime/${encodeURIComponent(id)}`,
      { method: "PATCH", body: JSON.stringify(patch) }
    )
  },
  embyDashboard(refresh = false) {
    return request<EmbyDashboardResponse>(
      `/api/emby/dashboard${refresh ? "?refresh=true" : ""}`
    )
  },
  async embyImage(id: string) {
    const token = getAccessToken()
    const response = await fetch(
      `/api/emby/items/${encodeURIComponent(id)}/image`,
      {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      }
    )
    if (!response.ok) throw new Error(`图片请求失败 (${response.status})`)
    return response.blob()
  },
}

export const fetchProviders = mediaApi.fetchProviders
export const discover = mediaApi.discover
export const fetchDetail = mediaApi.fetchDetail
