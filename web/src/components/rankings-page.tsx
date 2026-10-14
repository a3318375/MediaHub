import { useEffect, useMemo, useRef, useState } from "react"
import { FlameIcon, RotateCwIcon, TrophyIcon } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { MediaPosterCard } from "@/components/media-poster-card"
import { useMediaDetail } from "@/components/media-detail-context"
import {
  mediaApi,
  formatMediaError,
  type RankingsResponse,
} from "@/lib/media-api"
import type { MediaSummary } from "@/lib/media-contract"
import { formatRegion, presentTitle } from "@/lib/media-presentation"

/** 展示用榜单条目：全部来自真实接口，缺失字段留空，不编造。 */
type RankingEntry = {
  id: string
  title: string
  subtitle?: string
  year?: number
  kind: string
  rating?: number
  region?: string
  source: string
  summary: MediaSummary
  provider: MediaSummary["provider"]
  providerId: string
  mediaType: MediaSummary["mediaType"]
}

const sourceLabels: Record<string, string> = {
  imdb: "IMDb",
  tmdb: "TMDB",
  douban: "豆瓣",
  bangumi: "Bangumi",
  anilist: "AniList",
}

/** 后端返回的是榜单键（source:name），这里映射成原有页面的榜单名与顺序。 */
const rankingMeta: Record<
  string,
  { title: string; source: string; description: string }
> = {
  "imdb:top250": {
    title: "IMDb 最热门电影",
    source: "IMDb 热门电影",
    description: "近期关注度较高的电影",
  },
  "imdb:popular": {
    title: "IMDb 最热门剧集",
    source: "IMDb 最热门剧集",
    description: "近期关注度较高的剧集",
  },
  "tmdb:trending": {
    title: "TMDB 趋势",
    source: "TMDB 趋势",
    description: "近期讨论度上升的影视内容",
  },
  "anilist:popularity": {
    title: "AniList 热门",
    source: "AniList 热门",
    description: "动画社区人气作品",
  },
  "bangumi:rank": {
    title: "Bangumi 今日动画",
    source: "Bangumi 今日动画",
    description: "Bangumi 动画条目排行（上游 rank 排序）",
  },
  "douban:movie_top250": {
    title: "豆瓣电影 Top 250",
    source: "豆瓣电影 Top 250",
    description: "豆瓣电影 Top 250 榜单（真实接口）",
  },
  "douban:tv_hot": {
    title: "豆瓣热门剧集",
    source: "豆瓣热门剧集",
    description: "豆瓣热门剧集榜单（真实接口）",
  },
}

/** 原有页面的榜单顺序：IMDb 两个 → TMDB → AniList → Bangumi，豆瓣榜单排在其后。 */
const rankingOrder = [
  "imdb:top250",
  "imdb:popular",
  "tmdb:trending",
  "anilist:popularity",
  "bangumi:rank",
  "douban:movie_top250",
  "douban:tv_hot",
]

function metaFor(source: string, name: string) {
  const key = `${source}:${name}`
  return (
    rankingMeta[key] ?? {
      title: `${sourceLabels[source] ?? source} ${name}`,
      source: sourceLabels[source] ?? source,
      description: "来自数据源的实时榜单。",
    }
  )
}

type RankingSectionData = {
  id: string
  name: string
  source: string
  description: string
  supported: boolean
  available: boolean
  message?: string
  entries: RankingEntry[]
}

function kindLabel(mediaType: string) {
  if (mediaType === "movie") return "电影"
  if (mediaType === "anime") return "动画"
  if (mediaType === "tv") return "剧集"
  return mediaType
}

function toEntry(item: MediaSummary, sourceLabel: string): RankingEntry {
  const title = presentTitle(item)
  return {
    id: item.mediaId,
    title: title.title,
    subtitle: title.subtitle,
    year: item.year,
    kind: kindLabel(item.mediaType),
    rating: item.ratings?.[0]?.value,
    region: cityOrRegion(item),
    source: sourceLabel,
    summary: item,
    provider: item.provider,
    providerId: item.providerId,
    mediaType: item.mediaType,
  }
}

/** 榜单范围筛选用产地：只取上游真实字段，缺失就不参与筛选。 */
function cityOrRegion(item: MediaSummary) {
  if (item.region) return item.region
  const country = item.originCountries?.[0]
  return country ? country : undefined
}

function RankingPoster({
  entry,
  index,
  onOpen,
  onResourceSearch,
}: {
  entry: RankingEntry
  index: number
  onOpen: (entry: RankingEntry) => void
  onResourceSearch: (keyword: string) => void
}) {
  return (
    <MediaPosterCard
      item={entry.summary}
      sourceLabel={entry.source}
      rank={index + 1}
      onResourceSearch={onResourceSearch}
      onOpen={() => onOpen(entry)}
    />
  )
}

function RankingSection({
  title,
  source,
  description,
  note,
  entries,
  onOpen,
  onResourceSearch,
}: {
  title: string
  source: string
  description: string
  note?: string
  entries: RankingEntry[]
  onOpen: (entry: RankingEntry) => void
  onResourceSearch: (keyword: string) => void
}) {
  if (!entries.length && !note) return null
  return (
    <section
      className="border-b border-border/70 pb-5 last:border-b-0"
      aria-label={title}
    >
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className="text-[10px] font-semibold tracking-wide uppercase"
            >
              {source}
            </Badge>
            <h3 className="text-base font-semibold tracking-tight">{title}</h3>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        </div>
        <span className="text-xs text-muted-foreground">
          {entries.length
            ? `热门 · ${entries.length} 部 · 横向滑动查看更多`
            : "未接入"}
        </span>
      </div>
      {entries.length ? (
        <div className="flex gap-3 overflow-x-auto pb-3">
          {entries.map((entry, index) => (
            <RankingPoster
              key={`${entry.id}:${index}`}
              entry={entry}
              index={index}
              onOpen={onOpen}
              onResourceSearch={onResourceSearch}
            />
          ))}
        </div>
      ) : (
        <div className="flex min-h-24 flex-col items-center justify-center gap-1 rounded-xl border border-dashed bg-muted/20 text-center">
          <TrophyIcon className="size-5 text-muted-foreground" />
          <p className="text-sm font-medium">{note ?? "该榜单暂未接入"}</p>
        </div>
      )}
    </section>
  )
}

export function RankingsPage({
  onResourceSearch,
}: {
  onResourceSearch: (keyword: string) => void
}) {
  const [data, setData] = useState<RankingsResponse | null>(null)
  const [platform, setPlatform] = useState("热门")
  const [category, setCategory] = useState("all")
  const [region, setRegion] = useState("全球")
  const [revision, setRevision] = useState(0)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [notice, setNotice] = useState("")
  const [savedIds, setSavedIds] = useState<string[]>([])
  const detailRequest = useRef<AbortController | null>(null)
  const openMediaDetail = useMediaDetail()

  useEffect(() => {
    const controller = new AbortController()
    void mediaApi
      .rankings(controller.signal)
      .then((response) => {
        if (!controller.signal.aborted) setData(response)
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setNotice(formatMediaError(error))
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false)
          setRefreshing(false)
        }
      })
    return () => {
      controller.abort()
    }
  }, [revision])

  const sections = useMemo<RankingSectionData[]>(() => {
    const rows = data?.rankings ?? []
    return [...rows]
      .sort((a, b) => {
        const left = rankingOrder.indexOf(`${a.source}:${a.name}`)
        const right = rankingOrder.indexOf(`${b.source}:${b.name}`)
        return (
          (left < 0 ? rankingOrder.length : left) -
          (right < 0 ? rankingOrder.length : right)
        )
      })
      .map((ranking) => {
        const meta = metaFor(ranking.source, ranking.name)
        return {
          id: `${ranking.source}:${ranking.name}`,
          name: meta.title,
          source: meta.source,
          description: meta.description,
          supported: ranking.supported,
          available: ranking.available,
          message: ranking.message,
          entries: (ranking.result?.items ?? []).map((item) =>
            toEntry(item, meta.source)
          ),
        }
      })
  }, [data])

  const visibleSections = useMemo(() => {
    return sections
      .filter((item) => category === "all" || item.id === category)
      .map((item) =>
        region === "全球"
          ? item
          : {
              ...item,
              entries: item.entries.filter((entry) => entry.region === region),
            }
      )
  }, [sections, category, region])

  const totalEntries = visibleSections.reduce(
    (sum, section) => sum + section.entries.length,
    0
  )

  async function open(entry: RankingEntry) {
    detailRequest.current?.abort()
    const controller = new AbortController()
    detailRequest.current = controller
    setNotice("")
    const initial = {
      ...entry.summary,
      kind: entry.kind,
      sourceLabel: entry.source,
      summary: entry.summary.overview,
      rating: entry.summary.ratings?.[0]?.value,
      actionLabel: savedIds.includes(entry.id) ? "从片单移除" : "加入片单",
      onAction: () => toggleSaved(entry),
      detailLoading: true,
    }
    openMediaDetail(initial)
    try {
      const detail = await mediaApi.fetchDetail(
        entry.provider,
        entry.providerId,
        entry.mediaType,
        controller.signal
      )
      if (controller.signal.aborted) return
      openMediaDetail({
        ...detail,
        kind: entry.kind,
        sourceLabel: entry.source,
        summary: detail.overview,
        rating: detail.ratings?.[0]?.value,
        detailLoading: false,
        actionLabel: savedIds.includes(entry.id) ? "从片单移除" : "加入片单",
        onAction: () => toggleSaved(entry),
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

  function toggleSaved(entry: RankingEntry) {
    setSavedIds((current) =>
      current.includes(entry.id)
        ? current.filter((id) => id !== entry.id)
        : [...current, entry.id]
    )
  }

  function refresh() {
    if (refreshing) return
    setRefreshing(true)
    setNotice("")
    setRevision((value) => value + 1)
  }

  const regionOptions = useMemo(() => {
    const values = new Set<string>()
    for (const section of sections)
      for (const entry of section.entries)
        if (entry.region) values.add(entry.region)
    return ["全球", ...values]
  }, [sections])

  return (
    <div className="flex flex-col gap-4 p-4 sm:gap-5 sm:p-6 lg:p-7">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-sm">
        <p className="text-muted-foreground">
          浏览热门影视、动画与流媒体榜单。
        </p>
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="gap-1.5 font-normal">
            <FlameIcon />
            实时榜单
          </Badge>
          <span className="text-xs text-muted-foreground">
            {totalEntries} 部作品
          </span>
        </div>
      </div>

      <Card className="border-border/70 shadow-none">
        <CardContent className="flex flex-col gap-3 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs font-medium text-muted-foreground">
                选择平台
              </p>
              <p className="mt-0.5 text-sm font-semibold">流媒体榜单</p>
            </div>
            <Button
              variant="outline"
              size="lg"
              onClick={refresh}
              disabled={refreshing}
            >
              <RotateCwIcon
                data-icon="inline-start"
                className={refreshing ? "animate-spin" : undefined}
              />
              {refreshing ? "刷新中" : "刷新数据"}
            </Button>
          </div>

          <Tabs
            value={platform}
            onValueChange={(value) => value && setPlatform(value)}
          >
            <TabsList
              variant="line"
              className="w-full justify-start gap-1 overflow-x-auto rounded-none p-0"
            >
              <TabsTrigger
                value="热门"
                className="flex-none gap-2 rounded-lg border px-3 py-2 data-active:border-primary/40 data-active:bg-primary/5"
              >
                <FlameIcon />
                热门
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="flex flex-col gap-3 border-t pt-3 lg:flex-row lg:items-center lg:justify-between">
            <Tabs
              value={category}
              onValueChange={(value) => value && setCategory(value)}
            >
              <TabsList
                variant="pill"
                className="h-auto w-full flex-wrap lg:w-fit"
              >
                <TabsTrigger
                  value="all"
                  className="flex-none px-3 py-2 text-xs"
                >
                  全部榜单
                </TabsTrigger>
                {sections.map((section) => (
                  <TabsTrigger
                    key={section.id}
                    value={section.id}
                    className="flex-none px-3 py-2 text-xs"
                  >
                    {section.name}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            <div className="flex items-center gap-2">
              <span className="shrink-0 text-xs text-muted-foreground">
                榜单范围
              </span>
              <Select
                value={region}
                onValueChange={(value) => {
                  if (value) setRegion(value)
                }}
              >
                <SelectTrigger className="h-9 w-36" aria-label="榜单范围">
                  <SelectValue>
                    {region === "全球" ? "全球" : formatRegion([region])}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {regionOptions.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option === "全球" ? "全球" : formatRegion([option])}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {notice && (
        <Alert variant="destructive">
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}
      {loading && <p role="status">正在读取榜单…</p>}

      <Card className="border-border/70 shadow-none">
        <CardHeader className="flex-row items-end justify-between gap-3">
          <div>
            <CardDescription>
              {platform} ·{" "}
              {category === "all"
                ? "全部榜单"
                : (sections.find((item) => item.id === category)?.source ??
                  "")}{" "}
              · {region}
            </CardDescription>
            <CardTitle className="mt-1 text-xl">榜单推荐</CardTitle>
          </div>
          <p className="hidden text-xs text-muted-foreground md:block">
            榜单来自 TMDB / 豆瓣 / Bangumi / AniList 实时接口，IMDb 榜单未接入。
          </p>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          {visibleSections.some(
            (section) => section.entries.length > 0 || !section.supported
          ) ? (
            visibleSections.map((section) => (
              <RankingSection
                key={section.id}
                title={section.name}
                source={section.source}
                description={
                  section.supported
                    ? section.description
                    : `未支持 · ${section.message ?? "该榜单暂未接入"}`
                }
                note={
                  section.supported
                    ? section.available
                      ? "榜单暂无作品。"
                      : `数据源不可用 · ${section.message ?? ""}`
                    : "未支持 · 不用其它数据源冒充"
                }
                entries={
                  section.supported && section.available ? section.entries : []
                }
                onOpen={(entry) => void open(entry)}
                onResourceSearch={onResourceSearch}
              />
            ))
          ) : (
            <div className="flex min-h-48 flex-col items-center justify-center gap-2 rounded-xl border border-dashed bg-muted/20 text-center">
              <TrophyIcon className="size-6 text-muted-foreground" />
              <p className="text-sm font-medium">这个平台与范围下暂无榜单</p>
              <p className="text-xs text-muted-foreground">
                切换分类或刷新数据后重试。
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
