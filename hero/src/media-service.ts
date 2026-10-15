import type {
  MediaDetail,
  MediaPage,
  MediaSummary,
  MediaProvidersResponse,
} from "./media-contract";

export type Session = { mode: "demo" | "live"; name: string; token?: string };
export type TVDraft = {
  source: "tg" | "pansou";
  tmdbId: string;
  title: string;
  season: number;
  enabled: boolean;
  channels: string[];
  match: string;
  exclude: string;
};
export type TV = TVDraft & {
  id: string;
  poster: string;
  episodes: { number: number; name: string; airDate: string }[];
  resources: {
    title: string;
    url: string;
    cloud: string;
    channel: string;
    episode: number;
  }[];
  lastCheckedAt: string;
  nextCheckAt: string;
  lastError: string;
  metadataError: string;
};
export type Resource = {
  cloud: string;
  url: string;
  password?: string;
  note?: string;
  source?: string;
};
export type Resources = {
  total: number;
  items: { title: string; links?: Resource[] }[];
  linksByCloud: Record<string, Resource[]>;
};
export type Platform = { id: number; name: string; logo: string };
export type Download = {
  id: string;
  state: string;
  resourceId: string;
  progress: number;
  error?: string;
  createdAt: string;
};
export const SESSION = "mediahub.hero.session";
export function read<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) || "null") ?? fallback;
  } catch {
    return fallback;
  }
}
export function save(key: string, value: unknown) {
  localStorage.setItem(key, JSON.stringify(value));
}
export function readSession(): Session | null {
  let s: Session | null = null;
  try {
    s =
      JSON.parse(sessionStorage.getItem(SESSION) || "null") ||
      read<Session | null>(SESSION, null);
  } catch {
    /* Invalid saved sessions are ignored. */
  }
  return s &&
    (s.mode === "demo" || (s.mode === "live" && typeof s.token === "string"))
    ? s
    : null;
}

// Bounded, session-scoped cache. Pending identical requests share one promise.
const cache = new Map<string, { until: number; value: unknown }>();
const pending = new Map<string, Promise<unknown>>();
let generation = 0;
export function clearCache() {
  generation++;
  cache.clear();
  pending.clear();
}
export async function cached<T>(
  key: string,
  load: () => Promise<T>,
  force = false,
  ttl = 300_000,
): Promise<T> {
  const hit = cache.get(key);
  if (!force && hit && hit.until > Date.now()) return hit.value as T;
  if (pending.has(key)) return pending.get(key) as Promise<T>;
  const current = generation;
  const promise = load()
    .then((value) => {
      if (current === generation) {
        if (cache.size >= 80) cache.delete(cache.keys().next().value!);
        cache.set(key, { until: Date.now() + ttl, value });
      }
      return value;
    })
    .finally(() => {
      if (current === generation) pending.delete(key);
    });
  pending.set(key, promise);
  return promise;
}
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function request<T>(
  path: string,
  session?: Session | null,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch(path, {
      method,
      signal: controller.signal,
      cache: "no-store",
      headers: {
        ...(session?.token ? { Authorization: `Bearer ${session.token}` } : {}),
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const data =
      response.status === 204
        ? undefined
        : await response.json().catch(() => null);
    if (!response.ok)
      throw new ApiError(
        response.status,
        data?.message || data?.error || `请求失败 (${response.status})`,
      );
    if (response.status !== 204 && data === null)
      throw new Error("服务返回了无效响应");
    return data as T;
  } finally {
    clearTimeout(timer);
  }
}
export function image(path?: string | null) {
  if (!path) return undefined;
  if (path.startsWith("/api/")) return path;
  if (/^https?:\/\//i.test(path)) {
    const u = new URL(path);
    return /^img[1239]\.doubanio\.com$/i.test(u.hostname)
      ? `/api/media/image?source=douban&url=${encodeURIComponent(path)}`
      : path;
  }
  return `https://image.tmdb.org/t/p/w342${path.startsWith("/") ? path : `/${path}`}`;
}
export function safeURL(value: string) {
  try {
    return ["https:", "http:", "magnet:"].includes(new URL(value).protocol)
      ? value
      : undefined;
  } catch {
    return undefined;
  }
}
export const demoMedia: MediaSummary[] = [
  ["沙丘：第二部", "DUNE · PART TWO", "movie", "693134", "2024", "科幻"],
  ["人生切割术", "SEVERANCE", "tv", "95396", "2025", "悬疑"],
  ["葬送的芙莉莲", "FRIEREN", "anime", "209867", "2023", "奇幻"],
  ["星际穿越", "INTERSTELLAR", "movie", "157336", "2014", "科幻"],
  ["黑镜", "BLACK MIRROR", "tv", "42009", "2025", "科幻"],
  ["流人", "SLOW HORSES", "tv", "95480", "2025", "惊悚"],
  ["蓦然回首", "LOOK BACK", "anime", "1244492", "2024", "动画"],
  ["奥本海默", "OPPENHEIMER", "movie", "872585", "2023", "剧情"],
  ["怪奇物语", "STRANGER THINGS", "tv", "66732", "2025", "悬疑"],
  ["机器人之梦", "ROBOT DREAMS", "movie", "838240", "2023", "动画"],
  ["胆大党", "DAN DA DAN", "anime", "240411", "2024", "动画"],
  ["最后生还者", "THE LAST OF US", "tv", "100088", "2025", "剧情"],
].map(([title, originalTitle, mediaType, id, year, genre], index) => ({
  title,
  originalTitle,
  mediaType: mediaType as MediaSummary["mediaType"],
  provider: "tmdb",
  source: "tmdb",
  providerId: id,
  sourceId: id,
  mediaId: `tmdb:${mediaType}:${id}`,
  year: Number(year),
  genres: [genre],
  ratings: [{ source: "tmdb", value: 8.1 + (index % 8) / 10 }],
  overview: `${title} · 此处为本地演示资料。切换到服务模式后显示来源提供的真实简介、评分和海报。`,
}));
export const initialTV: TV[] = demoMedia
  .filter((m) => m.mediaType === "tv")
  .slice(0, 2)
  .map((m, index) => {
    const today = new Date();
    const date = (offset: number) =>
      new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Shanghai",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date(today.getTime() + offset * 86400000));
    return {
      id: `demo-${index}`,
      source: "tg",
      tmdbId: m.sourceId,
      title: m.title,
      season: 1,
      enabled: true,
      channels: ["demo_channel"],
      match: "",
      exclude: "",
      poster: "",
      episodes: [0, 3, 7, 14].map((offset, i) => ({
        number: i + 1,
        name: `第 ${i + 1} 集`,
        airDate: date(offset + index),
      })),
      resources: [],
      lastCheckedAt: "",
      nextCheckAt: "",
      lastError: "",
      metadataError: "",
    };
  });
export function service(session: Session) {
  const live = session.mode === "live";
  const get = <T>(path: string, force = false, ttl?: number) =>
    cached(
      `${session.mode}:${path}`,
      () => request<T>(path, session),
      force,
      ttl,
    );
  return {
    providers: () => get<MediaProvidersResponse>("/api/media/providers"),
    discover: (query: Record<string, string>, force = false) =>
      live
        ? get<MediaPage<MediaSummary>>(
            `/api/media/discover?${new URLSearchParams(query)}`,
            force,
          )
        : Promise.resolve({
            items: demoMedia.filter(
              (m) =>
                (!query.query ||
                  m.title.includes(query.query) ||
                  m.originalTitle
                    ?.toLowerCase()
                    .includes(query.query.toLowerCase())) &&
                (!query.mediaType || m.mediaType === query.mediaType),
            ),
            hasMore: false,
            total: demoMedia.length,
          } as MediaPage<MediaSummary>),
    ranking: async (source: string, name: string, force = false) => {
      if (!live) return demoMedia;
      const result = await get<{
        rankings: {
          available: boolean;
          supported: boolean;
          message?: string;
          result?: MediaPage<MediaSummary>;
        }[];
      }>(`/api/media/rankings?${new URLSearchParams({ source, name })}`, force);
      const chart = result.rankings[0];
      if (!chart?.available || !chart.supported)
        throw new Error(chart?.message || "当前榜单不可用");
      return chart.result?.items || [];
    },
    platforms: (type: string, region: string) =>
      live
        ? get<{ items: Platform[] }>(
            `/api/media/rankings/platforms?${new URLSearchParams({ mediaType: type, region })}`,
            false,
            86400000,
          ).then((r) => r.items)
        : Promise.resolve([
            { id: 8, name: "Netflix", logo: "" },
            { id: 337, name: "Disney+", logo: "" },
            { id: 119, name: "Amazon Prime Video", logo: "" },
            { id: 350, name: "Apple TV+", logo: "" },
          ]),
    detail: (m: MediaSummary) =>
      live
        ? get<MediaDetail>(
            `/api/media/${m.source}/${encodeURIComponent(m.sourceId)}?mediaType=${m.mediaType}`,
          )
        : Promise.resolve({
            ...m,
            seasons:
              m.mediaType === "tv"
                ? [1, 2].map((seasonNumber) => ({
                    seasonNumber,
                    name: `第 ${seasonNumber} 季`,
                    episodeCount: 8,
                  }))
                : [],
          }),
    tv: () =>
      live
        ? request<TV[]>("/api/v1/subscriptions/tv", session)
        : Promise.resolve(read<TV[]>("mediahub.hero.tv", initialTV)),
    saveTV: (draft: TVDraft, id?: string) =>
      request<TV>(
        `/api/v1/subscriptions/tv${id ? `/${encodeURIComponent(id)}` : ""}`,
        session,
        id ? "PUT" : "POST",
        draft,
      ),
    removeTV: (id: string) =>
      request<void>(
        `/api/v1/subscriptions/tv/${encodeURIComponent(id)}`,
        session,
        "DELETE",
      ),
    refreshTV: (id: string) =>
      request<TV>(
        `/api/v1/subscriptions/tv/${encodeURIComponent(id)}/refresh`,
        session,
        "POST",
      ),
    search: async (query: string, force = false): Promise<Resources> => {
      if (!live)
        return {
          total: 2,
          items: [],
          linksByCloud: {
            "115": [
              {
                cloud: "115",
                url: "https://115.com/s/demo",
                note: `${query} · 演示分享（无真实资源）`,
              },
            ],
            magnet: [
              {
                cloud: "magnet",
                url: `magnet:?xt=urn:btih:${"0".repeat(40)}&dn=${encodeURIComponent(query)}`,
                note: `${query} · 演示磁力（无真实资源）`,
              },
            ],
          },
        };
      const meta = await get<{
        data: {
          selection: {
            channels: string[];
            plugins: string[];
            cloudTypes: string[];
          };
        };
      }>("/api/v1/resources/meta");
      const selection = meta.data.selection;
      if (!selection.channels.length && !selection.plugins.length)
        throw new Error("请先在原前端全局设置中选择 TG 频道或搜索插件");
      return cached(
        `resources:${query}`,
        () =>
          request<{ data: Resources }>(
            "/api/v1/resources/search",
            session,
            "POST",
            {
              query,
              mode: "merge",
              source:
                selection.channels.length && selection.plugins.length
                  ? "all"
                  : selection.channels.length
                    ? "tg"
                    : "plugin",
              ...selection,
              refresh: force,
            },
          ).then((r) => r.data),
        force,
      );
    },
    downloads: () =>
      live
        ? request<{ items: Download[] }>("/api/v1/downloads", session).then(
            (r) => r.items,
          )
        : Promise.resolve(read<Download[]>("mediahub.hero.downloads", [])),
  };
}
