import { getAccessToken } from "@/lib/auth-api"

export type AnimeFeed = { label: string; url: string; offset: number }
export type AnimeDraft = {
  title: string
  originalTitle: string
  bangumiId: string
  mikanId: string
  source: "mikan" | "ani-bt" | "anime-garden" | "other"
  url: string
  subgroup: string
  season: number
  offset: number
  totalEpisodes: number
  week: number
  releaseDate: string
  poster: string
  description: string
  rating: string
  enabled: boolean
  match: string[]
  exclude: string[]
  standby: AnimeFeed[]
}
export type SavedAnimeSubscription = AnimeDraft & {
  id: string
  createdAt: string
  updatedAt: string
  latestEpisode: number
  knownEpisodes: number[]
  completed: boolean
  lastCheckedAt: string
  lastError: string
  lastMetadataAt: string
  metadataError: string
  resources: AnimeEntry[]
}
export type AnimeEntry = {
  title: string
  url: string
  publishedAt: string
  episode: number | null
  accepted: boolean
  reason: string
  fileName: string
  feed: string
}
export type AnimePreview = {
  items: AnimeEntry[]
  accepted: number
  warnings: string[]
}
export type MikanItem = {
  id: string
  title: string
  poster: string
  week: string
}
export type GroupRegexItem = { label: string; regex: string }
export type MikanGroup = {
  groupRegex: { regexList: GroupRegexItem[][]; tags: string[] }
  label: string
  url: string
  bangumiId: string
  items: AnimeEntry[]
}

export const emptyAnimeDraft = (): AnimeDraft => ({
  title: "",
  originalTitle: "",
  bangumiId: "",
  mikanId: "",
  source: "mikan",
  url: "",
  subgroup: "",
  season: 1,
  offset: 0,
  totalEpisodes: 0,
  week: 0,
  releaseDate: "",
  poster: "",
  description: "",
  rating: "",
  enabled: true,
  match: [],
  exclude: [],
  standby: [],
})
async function request<T>(
  path: string,
  signal?: AbortSignal,
  body?: unknown,
  method?: string
): Promise<T> {
  const token = getAccessToken()
  const response = await fetch(`/api/v1/${path}`, {
    signal,
    method: method ?? (body ? "POST" : "GET"),
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await response.json().catch(() => null)
  if (!response.ok)
    throw new Error(data?.message ?? `请求失败 (${response.status})`)
  return data as T
}
export const animeApi = {
  list: (signal?: AbortSignal) =>
    request<SavedAnimeSubscription[]>("subscriptions/anime", signal),
  create: (draft: AnimeDraft, signal?: AbortSignal) =>
    request<SavedAnimeSubscription>("subscriptions/anime", signal, draft),
  enable: (id: string, enabled: boolean) =>
    request<SavedAnimeSubscription>(
      `subscriptions/anime/${encodeURIComponent(id)}`,
      undefined,
      { enabled },
      "PATCH"
    ),
  refresh: (id: string) =>
    request<SavedAnimeSubscription>(
      `subscriptions/anime/${encodeURIComponent(id)}/refresh`,
      undefined,
      undefined,
      "POST"
    ),
  resolve: (draft: AnimeDraft, signal?: AbortSignal) =>
    request<AnimeDraft>("subscriptions/anime/resolve", signal, draft),
  preview: (draft: AnimeDraft, signal?: AbortSignal) =>
    request<AnimePreview>("subscriptions/anime/preview", signal, draft),
  catalog: (
    query: string,
    season: string,
    refresh: boolean,
    signal?: AbortSignal,
    source: AnimeDraft["source"] = "mikan"
  ) => {
    const [year, quarter] = season.split(" ")
    const params = new URLSearchParams({
      query,
      refresh: String(refresh),
      ...(season
        ? source === "mikan"
          ? { year, season: quarter }
          : { season }
        : {}),
    })
    return request<{ items: MikanItem[]; seasons: string[] }>(
      `anime/sources/${source}/catalog?${params}`,
      signal
    )
  },
  groups: (
    id: string,
    signal?: AbortSignal,
    source: AnimeDraft["source"] = "mikan"
  ) => request<MikanGroup[]>(`anime/sources/${source}/${id}/groups`, signal),
}

// Stable presentation contract shared by real subscriptions and optional demo data.
export type AnimeSubscriptionStatus = "更新中" | "已暂停" | "已完结"
export type AnimeSubscription = {
  id: string
  title: string
  originalTitle: string
  status: AnimeSubscriptionStatus
  currentEpisode: number
  totalEpisodes?: number
  nextUpdate: string
  nextEpisode: string
  rating: string
  genres: string[]
  description: string
  palette: string
  artwork: string
  recentEpisodes: { episode: string; title: string; updatedAt: string }[]
  saved?: SavedAnimeSubscription
}
export function presentAnime(saved: SavedAnimeSubscription): AnimeSubscription {
  const weekdays = ["", "周一", "周二", "周三", "周四", "周五", "周六", "周日"]
  return {
    id: saved.id,
    title: saved.title,
    originalTitle: saved.originalTitle,
    status: saved.completed ? "已完结" : saved.enabled ? "更新中" : "已暂停",
    currentEpisode: saved.latestEpisode || 0,
    totalEpisodes: saved.totalEpisodes || undefined,
    nextUpdate: saved.completed
      ? "已完结"
      : saved.enabled
        ? weekdays[saved.week] || "更新日未知"
        : "已暂停",
    nextEpisode: saved.lastCheckedAt
      ? saved.latestEpisode
        ? `资源更新至 ${saved.latestEpisode} 集`
        : "暂无匹配资源"
      : "尚未同步",
    rating: saved.rating || "—",
    genres: [],
    description: saved.description,
    palette: "from-slate-700 via-slate-900 to-slate-950",
    artwork: saved.title,
    recentEpisodes: (saved.resources ?? []).slice(0, 5).map((item) => ({
      episode: `第 ${item.episode} 集`,
      title: item.title,
      updatedAt: item.publishedAt,
    })),
    saved,
  }
}
