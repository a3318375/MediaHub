import { useEffect, useRef, useState } from "react"
import {
  ArrowUpRightIcon,
  FilmIcon,
  RotateCwIcon,
  TrophyIcon,
} from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { MediaPosterCard } from "@/components/media-poster-card"
import { useMediaDetail } from "@/components/media-detail-context"
import {
  mediaApi,
  formatMediaError,
  type RankingsResponse,
} from "@/lib/media-api"
import type { MediaSummary } from "@/lib/media-contract"
import { cn } from "@/lib/utils"

type Chart = { id: string; label: string; description: string }
const sources = [
  {
    id: "tmdb",
    name: "TMDB",
    icon: "/icons/tmdb.svg",
    color: "bg-emerald-500/10",
    url: "https://www.themoviedb.org/",
  },
  {
    id: "douban",
    name: "豆瓣",
    icon: "/icons/douban.svg",
    color: "bg-green-600/10",
    url: "https://movie.douban.com/",
  },
  {
    id: "anilist",
    name: "AniList",
    icon: "/icons/anilist.svg",
    color: "bg-sky-500/10",
    url: "https://anilist.co/",
  },
  {
    id: "bangumi",
    name: "Bangumi",
    icon: "/icons/bangumi.svg",
    color: "bg-pink-500/10",
    url: "https://bgm.tv/",
  },
  {
    id: "streaming",
    name: "更多平台",
    icon: "",
    color: "bg-violet-500/10",
    url: "https://www.justwatch.com/",
  },
]
const charts: Record<string, Chart[]> = {
  tmdb: [
    {
      id: "movie_day",
      label: "电影 · 今日趋势",
      description: "TMDB 全球电影今日趋势",
    },
    {
      id: "tv_day",
      label: "剧集 · 今日趋势",
      description: "TMDB 全球剧集今日趋势",
    },
    {
      id: "movie_week",
      label: "电影 · 本周趋势",
      description: "TMDB 全球电影本周趋势",
    },
    {
      id: "tv_week",
      label: "剧集 · 本周趋势",
      description: "TMDB 全球剧集本周趋势",
    },
    { id: "movie_popular", label: "热门电影", description: "按 TMDB 热度排序" },
    { id: "tv_popular", label: "热门剧集", description: "按 TMDB 热度排序" },
    { id: "movie_top", label: "高分电影", description: "TMDB 高分电影榜" },
    { id: "tv_top", label: "高分剧集", description: "TMDB 高分剧集榜" },
    { id: "movie_now", label: "正在上映", description: "TMDB 正在上映电影" },
    {
      id: "movie_upcoming",
      label: "即将上映",
      description: "TMDB 即将上映电影",
    },
    { id: "tv_airing", label: "今日播出", description: "TMDB 今日播出剧集" },
    { id: "tv_on_air", label: "近期播出", description: "TMDB 近期播出剧集" },
  ],
  douban: [
    {
      id: "movie_top250",
      label: "电影 Top 250",
      description: "豆瓣电影 Top 250 · 展示榜首 20 部",
    },
    { id: "tv_hot", label: "热门剧集", description: "豆瓣热门剧集" },
  ],
  anilist: [
    {
      id: "popularity",
      label: "人气动画",
      description: "按 AniList 累计人气排序",
    },
    {
      id: "trending",
      label: "趋势动画",
      description: "按 AniList 当前趋势排序",
    },
    { id: "score", label: "高分动画", description: "按 AniList 评分排序" },
  ],
  bangumi: [
    { id: "rank", label: "动画排名", description: "Bangumi 动画评分排名" },
    {
      id: "airing",
      label: "今日放送",
      description: "按北京时间选取当天星期的放送表，不代表热度排名",
    },
  ],
}
const regions = [
  ["US", "美国"],
  ["CN", "中国大陆"],
  ["HK", "中国香港"],
  ["TW", "中国台湾"],
  ["JP", "日本"],
  ["KR", "韩国"],
  ["GB", "英国"],
  ["CA", "加拿大"],
  ["AU", "澳大利亚"],
  ["DE", "德国"],
  ["FR", "法国"],
  ["IN", "印度"],
  ["SG", "新加坡"],
]
// Match the live regional catalog by name; provider IDs and logos remain upstream data.
const featuredPlatformNames = [
  /^(Netflix|奈飞|奈菲)$/i,
  /^(Disney\+|Disney Plus)$/i,
  /^(Amazon Prime Video|Prime Video)$/i,
  /^(HBO Max|Max|HBO)$/i,
  /^Apple TV(\+| Plus)?$/i,
  /^Crunchyroll$/i,
  /^Hulu$/i,
  /^Amazon Video$/i,
  /^Paramount\+$/i,
  /^Peacock( Premium)?$/i,
]
type Platform = { id: number; name: string; logo: string }
type Ranking = RankingsResponse["rankings"][number]
const inputClass =
  "h-9 rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"

function RankingTabs({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: { value: string; label: string }[]
  onChange: (value: string) => void
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-4">
      <span className="shrink-0 pt-2 text-xs font-medium text-muted-foreground sm:w-16">
        {label}
      </span>
      <Tabs
        value={value}
        onValueChange={(next) => {
          if (next && next !== value) onChange(next)
        }}
        className="min-w-0 flex-1"
      >
        <TabsList
          variant="pill"
          aria-label={label}
          className="h-auto w-full flex-wrap justify-start gap-2"
        >
          {options.map((option) => (
            <TabsTrigger
              key={option.value}
              value={option.value}
              className="h-8 flex-none px-3 text-xs"
            >
              {option.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
    </div>
  )
}

function SourceIcon({
  src,
  name,
  className,
}: {
  src: string
  name: string
  className?: string
}) {
  const [failedSrc, setFailedSrc] = useState("")
  return src && failedSrc !== src ? (
    <img
      src={src}
      alt=""
      className={cn("size-9 object-contain", className)}
      onError={() => setFailedSrc(src)}
    />
  ) : (
    <span
      aria-hidden="true"
      className={cn(
        "flex size-9 items-center justify-center text-lg font-bold",
        className
      )}
    >
      {name.slice(0, 1)}
    </span>
  )
}

export function RankingsPage({
  onResourceSearch,
}: {
  onResourceSearch: (keyword: string) => void
}) {
  const [source, setSource] = useState("tmdb")
  const [chart, setChart] = useState("movie_day")
  const [region, setRegion] = useState("US")
  const [mediaType, setMediaType] = useState("tv")
  const [monetization, setMonetization] = useState("flatrate")
  const [platforms, setPlatforms] = useState<Platform[]>([])
  const [platform, setPlatform] = useState("")
  const [platformQuery, setPlatformQuery] = useState("")
  const [platformLoading, setPlatformLoading] = useState(true)
  const [platformError, setPlatformError] = useState("")
  const [result, setResult] = useState<Ranking | null>(null)
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState("")
  const [revision, setRevision] = useState(0)
  const cache = useRef(new Map<string, { result: Ranking; until: number }>())
  const detailRequest = useRef<AbortController | null>(null)
  const openMediaDetail = useMediaDetail()
  const streaming = source === "streaming"
  const activeSource = sources.find((item) => item.id === source)!
  const selectedPlatform = platforms.find(
    (item) => String(item.id) === platform
  )
  const name = streaming
    ? platform
      ? `platform_${mediaType}_${region}_${platform}_${monetization}`
      : ""
    : chart
  const provider = streaming ? "tmdb" : source
  const calendarDate = new Date().toLocaleDateString("en-CA", {
    timeZone: "Asia/Shanghai",
  })
  const cacheKey = `${provider}:${name}${source === "bangumi" && chart === "airing" ? `:${calendarDate}` : ""}`
  const currentChart = charts[source]?.find((item) => item.id === chart)
  const title = streaming
    ? `${selectedPlatform?.name ?? "选择平台"} · ${mediaType === "tv" ? "热门剧集" : "热门电影"}`
    : currentChart?.label
  const items = result?.available ? (result.result?.items ?? []) : []

  useEffect(() => {
    const controller = new AbortController()
    void mediaApi
      .rankingPlatforms(mediaType, region, controller.signal)
      .then(({ items }) => {
        if (controller.signal.aborted) return
        setPlatforms(items)
        setPlatform((current) =>
          items.some((item) => String(item.id) === current)
            ? current
            : String(items[0]?.id ?? "")
        )
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setPlatforms([])
          setPlatform("")
          setPlatformError(formatMediaError(error))
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setPlatformLoading(false)
      })
    return () => controller.abort()
  }, [mediaType, region, revision])

  useEffect(() => {
    const controller = new AbortController()
    if (!name) return () => controller.abort()
    const key = cacheKey
    const cached = cache.current.get(key)
    const hit = cached && Date.now() < cached.until
    const request = hit
      ? Promise.resolve({ rankings: [cached.result] })
      : mediaApi.rankings(controller.signal, provider, name)
    void request
      .then((response) => {
        if (controller.signal.aborted) return
        const row = response.rankings.find(
          (item) => item.source === provider && item.name === name
        )
        if (!row) throw new Error("该榜单暂未接入")
        setResult(row)
        if (row.available && !hit) {
          if (cache.current.size >= 40)
            cache.current.delete(cache.current.keys().next().value!)
          cache.current.set(key, {
            result: row,
            until: Date.now() + 5 * 60_000,
          })
        }
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setNotice(formatMediaError(error))
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [provider, name, cacheKey, revision])

  useEffect(() => () => detailRequest.current?.abort(), [])

  async function open(item: MediaSummary) {
    detailRequest.current?.abort()
    const controller = new AbortController()
    detailRequest.current = controller
    const initial = {
      ...item,
      kind:
        item.mediaType === "movie"
          ? "电影"
          : item.mediaType === "tv"
            ? "剧集"
            : "动画",
      sourceLabel: streaming ? "TMDB" : activeSource.name,
      summary: item.overview,
      rating: item.ratings?.[0]?.value,
      detailLoading: true,
    }
    openMediaDetail(initial)
    try {
      const detail = await mediaApi.fetchDetail(
        item.provider,
        item.providerId,
        item.mediaType,
        controller.signal
      )
      if (!controller.signal.aborted)
        openMediaDetail({
          ...initial,
          ...detail,
          summary: detail.overview,
          rating: detail.ratings?.[0]?.value,
          detailLoading: false,
        })
    } catch (error) {
      if (!controller.signal.aborted)
        openMediaDetail({
          ...initial,
          detailLoading: false,
          detailError: formatMediaError(error),
        })
    }
  }

  function begin() {
    detailRequest.current?.abort()
    setLoading(true)
    setResult(null)
    setNotice("")
  }

  function chooseSource(id: string) {
    if (id === source) return
    begin()

    setSource(id)
    setChart(charts[id]?.[0]?.id ?? "")
  }

  function refresh() {
    begin()
    setPlatformLoading(true)
    setPlatformError("")
    cache.current.delete(cacheKey)
    setRevision((value) => value + 1)
  }

  const featuredPlatforms = featuredPlatformNames.flatMap((pattern) => {
    const item = platforms.find((entry) => pattern.test(entry.name))
    return item ? [item] : []
  })

  function choosePlatform(item: Platform) {
    if (streaming && platform === String(item.id)) return
    begin()
    setSource("streaming")
    setChart("")
    setPlatform(String(item.id))
  }

  function sourceSelected(id: string) {
    return (
      source === id &&
      (id !== "streaming" ||
        !featuredPlatforms.some((item) => String(item.id) === platform))
    )
  }

  const updated = result?.result?.fetchedAt
  const updatedDate = updated ? new Date(updated) : null
  const updatedLabel =
    updatedDate && !Number.isNaN(updatedDate.getTime())
      ? updatedDate.toLocaleString("zh-CN", {
          timeZone: "Asia/Shanghai",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        })
      : ""
  const visiblePlatforms = platforms.filter((item) =>
    item.name.toLowerCase().includes(platformQuery.trim().toLowerCase())
  )

  return (
    <div className="flex flex-col gap-5 p-4 sm:p-6 lg:p-7">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">榜单推荐</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            从不同社区与平台，发现下一部想看的作品。
          </p>
        </div>
        <Button
          variant="outline"
          onClick={refresh}
          disabled={
            (loading && Boolean(name)) || (streaming && platformLoading)
          }
        >
          <RotateCwIcon
            className={
              (loading && name) || (streaming && platformLoading)
                ? "animate-spin"
                : undefined
            }
          />
          重新读取
        </Button>
      </div>

      <div
        className="grid grid-cols-3 gap-2 sm:grid-cols-5 sm:gap-3 lg:grid-cols-7"
        role="group"
        aria-label="榜单来源"
      >
        {sources.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={sourceSelected(item.id)}
            onClick={() => chooseSource(item.id)}
            className={cn(
              "group flex min-h-24 flex-col items-center justify-center gap-2 rounded-xl border bg-card px-3 py-4 transition-colors hover:border-primary/40 hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
              sourceSelected(item.id) &&
                "border-primary bg-primary/5 ring-1 ring-primary/20"
            )}
          >
            <span
              className={cn(
                "flex size-12 items-center justify-center rounded-xl",
                item.color
              )}
            >
              {item.id === "streaming" ? (
                <FilmIcon className="size-7 text-violet-500" />
              ) : (
                <SourceIcon src={item.icon} name={item.name} />
              )}
            </span>
            <span
              className={cn(
                "text-sm font-medium",
                sourceSelected(item.id)
                  ? "text-foreground"
                  : "text-muted-foreground"
              )}
            >
              {item.name}
            </span>
          </button>
        ))}
        {featuredPlatforms.map((item) => (
          <button
            key={`platform-${item.id}`}
            type="button"
            aria-pressed={streaming && platform === String(item.id)}
            onClick={() => choosePlatform(item)}
            className={cn(
              "flex min-h-24 flex-col items-center justify-center gap-2 rounded-xl border bg-card px-3 py-4 transition-colors hover:border-primary/40 hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
              streaming &&
                platform === String(item.id) &&
                "border-primary bg-primary/5 ring-1 ring-primary/20"
            )}
          >
            <SourceIcon
              src={item.logo}
              name={item.name}
              className="size-12 rounded-xl"
            />
            <span className="text-center text-sm font-medium">{item.name}</span>
          </button>
        ))}
      </div>
      {!streaming && platformLoading && (
        <p role="status" className="text-xs text-muted-foreground">
          正在加载 Netflix 等平台入口…
        </p>
      )}
      {!streaming && platformError && (
        <p className="text-xs text-muted-foreground">
          平台入口暂不可用：{platformError}
        </p>
      )}

      <div className="flex flex-col gap-4 rounded-xl border bg-card p-4">
        <div className="flex flex-col gap-4">
          {streaming ? (
            <>
              <RankingTabs
                label="可观看地区"
                value={region}
                options={regions.map(([value, label]) => ({ value, label }))}
                onChange={(value) => {
                  begin()
                  setPlatformLoading(true)
                  setPlatformError("")
                  setPlatforms([])
                  setPlatform("")
                  setRegion(value)
                }}
              />
              <RankingTabs
                label="内容类型"
                value={mediaType}
                options={[
                  { value: "tv", label: "剧集" },
                  { value: "movie", label: "电影" },
                ]}
                onChange={(value) => {
                  begin()
                  setPlatformLoading(true)
                  setPlatformError("")
                  setPlatforms([])
                  setPlatform("")
                  setMediaType(value)
                }}
              />
              <RankingTabs
                label="观看方式"
                value={monetization}
                options={[
                  { value: "flatrate", label: "订阅" },
                  { value: "free", label: "免费" },
                  { value: "ads", label: "含广告" },
                  { value: "rent", label: "租借" },
                  { value: "buy", label: "购买" },
                ]}
                onChange={(value) => {
                  begin()
                  setMonetization(value)
                }}
              />
              <input
                type="search"
                aria-label="查找平台"
                value={platformQuery}
                onChange={(event) => setPlatformQuery(event.target.value)}
                placeholder="查找 Netflix、Disney+…"
                className={cn(inputClass, "w-full sm:max-w-sm")}
              />
            </>
          ) : (
            <RankingTabs
              label="榜单"
              value={chart}
              options={(charts[source] ?? []).map((item) => ({
                value: item.id,
                label: item.label,
              }))}
              onChange={(value) => {
                begin()
                setChart(value)
              }}
            />
          )}
        </div>
        {streaming && (
          <>
            {platformLoading ? (
              <p role="status" className="text-sm text-muted-foreground">
                正在读取该地区的平台…
              </p>
            ) : platformError ? (
              <Alert variant="destructive">
                <AlertDescription>{platformError}</AlertDescription>
              </Alert>
            ) : (
              <div
                className="grid max-h-60 grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-5 lg:grid-cols-7"
                role="group"
                aria-label="流媒体平台"
              >
                {visiblePlatforms.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    aria-pressed={platform === String(item.id)}
                    onClick={() => {
                      if (platform !== String(item.id)) {
                        begin()
                        setPlatform(String(item.id))
                      }
                    }}
                    className={cn(
                      "flex flex-col items-center gap-2 rounded-lg border p-3 text-center transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                      platform === String(item.id) &&
                        "border-primary bg-primary/5"
                    )}
                  >
                    <SourceIcon
                      src={item.logo}
                      name={item.name}
                      className="size-10 rounded-lg"
                    />
                    <span className="text-xs leading-snug">{item.name}</span>
                  </button>
                ))}
                {!visiblePlatforms.length && (
                  <p className="col-span-full py-3 text-sm text-muted-foreground">
                    没有符合条件的平台。
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">{title}</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {streaming
              ? "按 TMDB 热度排序的地区可观看片单"
              : currentChart?.description}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          {updatedLabel && <span>更新于 {updatedLabel} · 北京时间</span>}
          <Badge variant="secondary">{items.length} 部作品</Badge>
          <a
            href={activeSource.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 hover:text-foreground"
          >
            {streaming ? "JustWatch" : activeSource.name}
            <ArrowUpRightIcon className="size-3" />
          </a>
        </div>
      </div>

      {notice && (
        <Alert variant="destructive">
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}
      {loading && name ? (
        <div
          className="grid grid-cols-2 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-9"
          aria-label="正在读取榜单"
          role="status"
        >
          {Array.from({ length: 14 }, (_, index) => (
            <div
              key={index}
              className="aspect-[2/3] animate-pulse rounded-xl bg-muted"
            />
          ))}
        </div>
      ) : items.length ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-9">
          {items.map((item, index) => (
            <MediaPosterCard
              key={item.mediaId}
              item={item}
              sourceLabel={streaming ? "TMDB" : activeSource.name}
              rank={chart === "airing" && !streaming ? undefined : index + 1}
              onOpen={() => void open(item)}
              onResourceSearch={onResourceSearch}
              className="w-full sm:w-full"
            />
          ))}
        </div>
      ) : (
        !notice &&
        (!streaming || !platformError) &&
        (!streaming || !platformLoading) && (
          <div className="flex min-h-56 flex-col items-center justify-center gap-2 rounded-xl border border-dashed bg-muted/20 text-center">
            <TrophyIcon className="size-6 text-muted-foreground" />
            <p className="text-sm font-medium">
              {result?.message ??
                (streaming && !platform
                  ? "选择平台后查看作品"
                  : "当前榜单暂无作品")}
            </p>
            <p className="text-xs text-muted-foreground">
              可以换个榜单、地区或来源。
            </p>
          </div>
        )
      )}

      {(source === "tmdb" || streaming) && (
        <p className="text-xs leading-relaxed text-muted-foreground">
          This product uses the TMDB API but is not endorsed or certified by
          TMDB.
          {streaming && (
            <>
              {" "}
              可观看性数据由{" "}
              <a
                href="https://www.justwatch.com/"
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                JustWatch
              </a>{" "}
              提供，片单按 TMDB 热度排序。
            </>
          )}
        </p>
      )}
    </div>
  )
}
