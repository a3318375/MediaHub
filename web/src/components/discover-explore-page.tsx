import { useEffect, useMemo, useRef, useState } from "react"
import { FilmIcon, RotateCwIcon, SearchIcon, SparklesIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { MediaPosterCard } from "@/components/media-poster-card"
import { useMediaDetail } from "@/components/media-detail-context"
import {
  mediaApi,
  formatMediaError,
  type DiscoverResponse,
} from "@/lib/media-api"
import type {
  MediaDiscoverQuery,
  MediaSummary,
  ProviderCapabilities,
} from "@/lib/media-contract"
import { formatResultTotal } from "@/lib/media-presentation"
import {
  mediaContextFromRecord,
  type DownloadMediaContext,
} from "@/lib/download-api"
import {
  readMediaSearchHistory,
  saveMediaSearchHistory,
  type MediaSearchHistoryEntry,
} from "@/lib/resource-search"

/** 来源页签标签与顺序：沿用原有页面。 */
const sourceTabLabels: Record<string, string> = {
  tmdb: "TMDB 片库",
  douban: "豆瓣",
  anilist: "AniList 动漫",
  bangumi: "Bangumi 动漫",
}
const sourceTabOrder = ["tmdb", "douban", "anilist", "bangumi"]

/** 界面标签：上游枚举与类型 ID 统一映射成中文，未知值原样显示。 */
const optionLabels: Record<string, string> = {
  movie: "电影",
  tv: "电视剧",
  anime: "动画",
  documentary: "纪录片",
  "popularity.desc": "热度",
  "vote_average.desc": "TMDB 评分",
  "date.desc": "最新",
  rank: "排名",
  date: "最新",
  U: "推荐",
  T: "近期热度",
  S: "高分",
  R: "首播时间",
  POPULARITY_DESC: "热门",
  SCORE_DESC: "评分",
  TRENDING_DESC: "趋势",
  WINTER: "冬季",
  SPRING: "春季",
  SUMMER: "夏季",
  FALL: "秋季",
  FINISHED: "已完结",
  RELEASING: "连载中",
  NOT_YET_RELEASED: "未播出",
  CANCELLED: "已取消",
  HIATUS: "停更",
  Action: "动作",
  Adventure: "冒险",
  Comedy: "喜剧",
  Drama: "剧情",
  Ecchi: "擦边",
  Fantasy: "奇幻",
  Hentai: "成人",
  Horror: "恐怖",
  "Mahou Shoujo": "魔法少女",
  Mecha: "机战",
  Music: "音乐",
  Mystery: "悬疑",
  Psychological: "心理",
  Romance: "爱情",
  "Sci-Fi": "科幻",
  "Slice of Life": "日常",
  Sports: "运动",
  Supernatural: "超自然",
  Thriller: "惊悚",
  "28": "动作",
  "12": "冒险",
  "16": "动画",
  "35": "喜剧",
  "80": "犯罪",
  "99": "纪录",
  "18": "剧情",
  "10751": "家庭",
  "14": "奇幻",
  "36": "历史",
  "27": "恐怖",
  "10402": "音乐",
  "9648": "悬疑",
  "10749": "爱情",
  "878": "科幻",
  "10770": "电视电影",
  "53": "惊悚",
  "10752": "战争",
  "37": "西部",
  "10759": "动作冒险",
  "10762": "儿童",
  "10763": "新闻",
  "10764": "真人秀",
  "10765": "科幻奇幻",
  "10766": "肥皂剧",
  "10767": "脱口秀",
  "10768": "战争政治",
}

const regionLabels: Record<string, string> = {
  CN: "大陆",
  HK: "香港",
  TW: "台湾",
  JP: "日本",
  KR: "韩国",
  US: "欧美",
  GB: "英国",
}

const commonGenres = ["16", "35", "80", "99", "18", "10751", "9648", "37"]
const movieGenres = [
  "28",
  "12",
  "14",
  "36",
  "27",
  "10402",
  "10749",
  "878",
  "53",
  "10752",
  "10770",
]
const tvGenres = [
  "10759",
  "10765",
  "10762",
  "10763",
  "10764",
  "10766",
  "10767",
  "10768",
]

const filterLabels: Record<string, string> = {
  genre: "类型",
  region: "地区",
  season: "季度",
  status: "状态",
  sort: "排序",
}

function label(value: string) {
  return optionLabels[value] ?? value
}

function FilterRow({
  label: name,
  options,
  value,
  disabled,
  onChange,
}: {
  label: string
  options: { value: string; label: string }[]
  value: string
  disabled?: boolean
  onChange: (value: string) => void
}) {
  return (
    <div className="flex flex-col gap-1.5 border-b border-border/70 py-2 last:border-b-0 sm:flex-row sm:items-start sm:gap-4">
      <span className="w-12 shrink-0 pt-1 text-xs font-semibold text-muted-foreground">
        {name}
      </span>
      <ToggleGroup
        aria-label={name}
        value={[value]}
        onValueChange={(next) => {
          const picked = next.at(-1)
          if (picked) onChange(picked)
        }}
        className="flex w-full flex-wrap gap-1"
      >
        {options.map((option) => (
          <ToggleGroupItem
            key={option.value}
            value={option.value}
            size="sm"
            disabled={disabled}
            className={cn(
              "h-7 rounded-md px-2.5 text-xs text-muted-foreground data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:shadow-sm",
              option.value === value && "font-semibold"
            )}
          >
            {option.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  )
}

export function DiscoverExplorePage({
  onResourceSearch,
}: {
  onResourceSearch: (keyword: string, media?: DownloadMediaContext) => void
}) {
  const [providers, setProviders] = useState<ProviderCapabilities[]>([])
  const [tab, setTab] = useState("tmdb")
  const [mediaType, setMediaType] = useState("")
  const [filters, setFilters] = useState<Record<string, string>>({})
  const [queryDraft, setQueryDraft] = useState("")
  const [query, setQuery] = useState("")
  const [searchHistory, setSearchHistory] = useState<MediaSearchHistoryEntry[]>(
    () => readMediaSearchHistory(localStorage)
  )
  const [page, setPage] = useState(1)
  const [revision, setRevision] = useState(0)
  const [result, setResult] = useState<DiscoverResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState("")
  const listRequest = useRef<AbortController | null>(null)
  const detailRequest = useRef<AbortController | null>(null)
  const openMediaDetail = useMediaDetail()
  const provider = providers.find((entry) => entry.source === tab)
  const activeMediaType =
    provider?.mediaTypes.find((type) => type === mediaType) ??
    provider?.mediaTypes[0] ??
    ""
  const tabs = useMemo(
    () => [
      ...[...providers]
        .sort(
          (a, b) =>
            sourceTabOrder.indexOf(a.source) - sourceTabOrder.indexOf(b.source)
        )
        .map((entry) => ({
          id: entry.source,
          label: sourceTabLabels[entry.source] ?? entry.label,
          disabled: !entry.available,
          reason: entry.unavailableReason,
        })),
    ],
    [providers]
  )

  useEffect(() => {
    const controller = new AbortController()
    void mediaApi
      .fetchProviders(controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return
        setProviders(data.providers)
        setTab((current) =>
          data.providers.some(
            (entry) => entry.source === current && entry.available
          )
            ? current
            : (data.providers.find((entry) => entry.available)?.source ??
              "tmdb")
        )
        if (!data.providers.some((entry) => entry.available)) {
          const reason = data.providers[0]?.unavailableReason ?? ""
          setNotice(`当前没有可用数据源。${reason}`)
          setLoading(false)
        }
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setNotice(formatMediaError(error))
          setLoading(false)
        }
      })
    return () => {
      controller.abort()
      listRequest.current?.abort()
    }
  }, [revision])

  useEffect(() => {
    if (!provider?.available || !activeMediaType) return
    const controller = new AbortController()
    listRequest.current = controller
    const capabilities = provider.filters
    const request: MediaDiscoverQuery = {
      source: provider.source,
      mediaType: activeMediaType,
      page,
      pageSize: Math.min(20, provider.pageSizeMax),
    }
    // 上游无法组合搜索与筛选：搜索时只发送媒体类型与搜索词。
    if (query && provider.supportsSearch) request.query = query
    else {
      for (const key of [
        "genre",
        "region",
        "season",
        "status",
        "sort",
      ] as const) {
        if (filters[key] && capabilities[key].includes(filters[key]))
          request[key] = filters[key]
      }
      if (
        capabilities.year &&
        filters.year &&
        Number(filters.year) >= capabilities.year.min &&
        Number(filters.year) <= capabilities.year.max
      )
        request.year = Number(filters.year)
      if (capabilities.month && request.year && filters.month)
        request.month = Number(filters.month)
    }
    void mediaApi
      .discover(request, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setResult(data)
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setResult(null)
          setNotice(formatMediaError(error))
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [provider, activeMediaType, filters, query, page])

  const items = result?.items ?? []
  const sourceInfo = sourceTabLabels[tab] ?? provider?.label ?? tab

  /** TMDB 类型按媒体类型分组，保持原有中文顺序。 */
  const genreOptions = useMemo(() => {
    if (!provider) return []
    const values = provider.filters.genre
    if (!values.length) return []
    if (provider.source !== "tmdb") return values
    const allowed = new Set(values)
    const preferred = activeMediaType === "tv" ? tvGenres : movieGenres
    const ordered = [...commonGenres, ...preferred].filter((id) =>
      allowed.has(id)
    )
    const rest = values.filter((id) => !ordered.includes(id))
    return [...new Set([...ordered, ...rest])]
  }, [provider, activeMediaType])

  const yearOptions = useMemo(() => {
    const range = provider?.filters.year
    if (!range) return []
    const top = Math.min(range.max, new Date().getFullYear())
    const bottom = Math.max(range.min, top - 19)
    return Array.from({ length: top - bottom + 1 }, (_, index) =>
      String(top - index)
    )
  }, [provider])

  function changed(nextPage = 1) {
    listRequest.current?.abort()
    detailRequest.current?.abort()
    setPage(nextPage)
    setResult(null)
    setNotice("")
    setLoading(true)
  }

  function setFilter(key: string, value: string) {
    changed()
    setFilters((current) => ({
      ...current,
      [key]: value === "全部" ? "" : value,
    }))
  }

  function changeSource(value: string | null) {
    if (!value) return
    changed()
    setTab(value)
    setMediaType("")
    setFilters({})
    setQuery("")
    setQueryDraft("")
    setNotice("")
  }

  function resetFilters() {
    changed()
    setFilters({})
    setNotice("")
  }

  function clearSearch() {
    changed()
    setQuery("")
    setQueryDraft("")
  }

  function refresh() {
    changed()
    setRevision((value) => value + 1)
  }

  async function open(item: MediaSummary) {
    detailRequest.current?.abort()
    const controller = new AbortController()
    detailRequest.current = controller
    setNotice("")
    const initial = {
      ...item,
      sourceLabel: sourceInfo,
      kind: label(item.mediaType),
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
          ...detail,
          sourceLabel: sourceInfo,
          kind: label(detail.mediaType),
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

  const mediaTypeOptions =
    provider && provider.mediaTypes.length > 1 ? provider.mediaTypes : []

  return (
    <div className="flex flex-col gap-4 p-4 sm:gap-5 sm:p-6 lg:p-7">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-sm">
        <p className="text-muted-foreground">按来源探索电影、剧集与动画。</p>
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="gap-1.5 font-normal">
            <SparklesIcon />
            {sourceInfo}
          </Badge>
          <span className="text-xs text-muted-foreground">
            {loading && !result ? "读取中" : `${items.length} 部作品`}
          </span>
        </div>
      </div>

      <Card className="border-border/70 shadow-none">
        <CardContent className="p-3 sm:p-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <Tabs value={tab} onValueChange={changeSource}>
              <TabsList
                variant="pill"
                className="h-auto w-full flex-wrap xl:w-fit"
              >
                {tabs.map((entry) => (
                  <TabsTrigger
                    key={entry.id}
                    value={entry.id}
                    disabled={entry.disabled}
                    title={entry.reason}
                    className="flex-none px-3 py-2 text-xs sm:text-sm"
                  >
                    {entry.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            <form
              className="flex w-full flex-wrap items-center gap-2 xl:w-auto xl:flex-nowrap"
              onSubmit={(event) => {
                event.preventDefault()
                if (!provider?.supportsSearch) return
                const keyword = queryDraft.trim()
                if (!keyword) return
                setSearchHistory(
                  saveMediaSearchHistory(localStorage, {
                    kind: "media",
                    keyword,
                    source: provider.source,
                    at: Date.now(),
                  })
                )
                onResourceSearch(keyword)
              }}
            >
              <div className="relative min-w-0 flex-1 xl:w-56 xl:flex-none">
                <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  aria-label="搜索作品"
                  value={queryDraft}
                  onChange={(event) => setQueryDraft(event.target.value)}
                  placeholder={
                    provider?.supportsSearch
                      ? "输入片名，按 Enter 搜索"
                      : "该数据源不支持搜索"
                  }
                  disabled={!provider?.supportsSearch}
                  maxLength={200}
                  className="h-9 pl-9"
                />
              </div>
              <Button
                type="submit"
                size="lg"
                disabled={!provider?.supportsSearch}
              >
                <SearchIcon data-icon="inline-start" />
                搜索
              </Button>
              <Button
                type="button"
                variant="outline"
                size="lg"
                onClick={clearSearch}
              >
                清空
              </Button>
              <Button
                type="button"
                variant="outline"
                size="lg"
                onClick={resetFilters}
              >
                重置
              </Button>
              <Button
                type="button"
                variant="outline"
                size="lg"
                onClick={refresh}
                disabled={loading}
              >
                <RotateCwIcon
                  data-icon="inline-start"
                  className={loading ? "animate-spin" : undefined}
                />
                {loading ? "刷新中" : "刷新"}
              </Button>
            </form>
          </div>

          {searchHistory.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border/70 pt-3">
              <span className="mr-1 text-xs font-medium text-muted-foreground">
                搜索历史
              </span>
              {searchHistory.slice(0, 8).map((entry) => (
                <Button
                  key={`${entry.source}-${entry.keyword}-${entry.at}`}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const nextProvider = providers.find(
                      (item) => item.source === entry.source && item.available
                    )
                    if (nextProvider && nextProvider.source !== tab) {
                      setTab(nextProvider.source)
                      setMediaType(nextProvider.mediaTypes[0] ?? "")
                      setFilters({})
                    }
                    changed()
                    setQueryDraft(entry.keyword)
                    setQuery(entry.keyword)
                  }}
                >
                  {entry.keyword}
                  <span className="ml-1 text-xs text-muted-foreground">
                    {sourceTabLabels[entry.source] ?? entry.source}
                  </span>
                </Button>
              ))}
            </div>
          )}

          {provider && (
            <div className="mt-3 border-t border-border/70 pt-2">
              {mediaTypeOptions.length > 0 && (
                <FilterRow
                  label="影视类别"
                  options={[
                    { value: "全部", label: "全部" },
                    ...mediaTypeOptions.map((value) => ({
                      value,
                      label: label(value),
                    })),
                  ]}
                  value={mediaType || "全部"}
                  disabled={Boolean(query)}
                  onChange={(value) => {
                    changed()
                    setMediaType(value === "全部" ? "" : value)
                    setFilters((current) => ({ ...current, genre: "" }))
                  }}
                />
              )}
              {(["genre", "region", "season", "status", "sort"] as const).map(
                (key) => {
                  const values = provider.filters[key]
                  if (!values.length) return null
                  const raw = key === "genre" ? genreOptions : values
                  const formatter =
                    key === "region"
                      ? (value: string) => regionLabels[value] ?? value
                      : label
                  return (
                    <FilterRow
                      key={key}
                      label={filterLabels[key]}
                      options={[
                        { value: "全部", label: "全部" },
                        ...raw.map((value) => ({
                          value,
                          label: formatter(value),
                        })),
                      ]}
                      value={
                        filters[key] && values.includes(filters[key])
                          ? filters[key]
                          : "全部"
                      }
                      disabled={Boolean(query)}
                      onChange={(value) => setFilter(key, value)}
                    />
                  )
                }
              )}
              {yearOptions.length > 0 && (
                <FilterRow
                  label="年份"
                  options={[
                    { value: "全部", label: "全部" },
                    ...yearOptions.map((value) => ({ value, label: value })),
                  ]}
                  value={
                    filters.year && yearOptions.includes(filters.year)
                      ? filters.year
                      : "全部"
                  }
                  disabled={Boolean(query)}
                  onChange={(value) => setFilter("year", value)}
                />
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {notice && (
        <Alert variant="destructive">
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}

      <>
        {query && (
          <p className="text-xs text-muted-foreground">
            标题搜索仅发送媒体类型与搜索词；清空搜索后可使用筛选。
          </p>
        )}

        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-medium tracking-[0.16em] text-muted-foreground uppercase">
              {sourceInfo}
            </p>
            <h3 className="mt-1 text-lg font-semibold tracking-tight">
              {query ? `“${query}”的搜索结果` : "为你发现"}
            </h3>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary">
              第 {result?.page ?? page} 页 · {items.length} 部
              {result
                ? formatResultTotal(result.total, result.totalCapped)
                : ""}
            </Badge>
            <Button
              variant="outline"
              size="sm"
              disabled={loading || page <= 1}
              onClick={() => changed(page - 1)}
            >
              上一页
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={loading || !result?.hasMore}
              onClick={() => changed(page + 1)}
            >
              下一页
            </Button>
          </div>
        </div>

        {loading && !result ? (
          <p role="status">正在读取{sourceInfo}…</p>
        ) : items.length ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-9">
            {items.map((item) => (
              <MediaPosterCard
                key={item.mediaId}
                item={item}
                sourceLabel={sourceTabLabels[item.provider] ?? item.provider}
                onOpen={() => void open(item)}
                onResourceSearch={(keyword) =>
                  onResourceSearch(keyword, mediaContextFromRecord(item))
                }
                className="w-full sm:w-full"
              />
            ))}
          </div>
        ) : (
          <div className="flex min-h-56 flex-col items-center justify-center gap-2 rounded-xl border border-dashed bg-muted/20 px-6 text-center">
            <FilmIcon className="size-6 text-muted-foreground" />
            <p className="text-sm font-medium">没有找到符合条件的作品</p>
            <p className="text-xs text-muted-foreground">
              试试移除部分筛选条件，或换一个来源。
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                resetFilters()
                clearSearch()
              }}
            >
              清空筛选
            </Button>
          </div>
        )}

        {tab === "tmdb" && (
          <p className="text-xs text-muted-foreground">
            This product uses the TMDB API but is not endorsed or certified by
            TMDB.
          </p>
        )}
      </>
    </div>
  )
}
