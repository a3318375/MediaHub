import { useEffect, useMemo, useState } from "react"
import {
  ActivityIcon,
  CheckIcon,
  ClapperboardIcon,
  FilmIcon,
  Layers3Icon,
  Music2Icon,
  RefreshCwIcon,
  TvMinimalPlayIcon,
  StarIcon,
} from "lucide-react"
import { cn } from "cn"
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
import { useMediaDetail } from "@/components/media-detail-context"
import { mediaApi } from "@/lib/media-api"
import {
  type EmbyMediaItem,
  type EmbyResumeItem,
} from "@/mocks/data/emby-dashboard"


const statDefinitions = [
  { key: "movies", label: "电影" },
  { key: "series", label: "剧集" },
  { key: "episodes", label: "总集数" },
  { key: "plays", label: "播放次数" },
  { key: "viewers", label: "活跃观众" },
  { key: "hours", label: "时长(小时)" },
] as const

const libraryIcons = {
  电影: FilmIcon,
  剧集: TvMinimalPlayIcon,
  动画: ClapperboardIcon,
  纪录片: ActivityIcon,
  演出: Music2Icon,
}

function formatTime(date: Date) {
  return new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit" }).format(date)
}

function useEmbyImageUrl(id?: string) {
  const [imageUrl, setImageUrl] = useState<string>()

  useEffect(() => {
    let active = true
    let objectUrl: string | undefined
    if (!id) return
    mediaApi.embyImage(id).then((blob) => {
      if (!active) return
      objectUrl = URL.createObjectURL(blob)
      setImageUrl(objectUrl)
    }).catch(() => {})
    return () => {
      active = false
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [id])

  return imageUrl
}

function PosterArtwork({ item }: { item: EmbyMediaItem }) {
  const imageUrl = useEmbyImageUrl(item.id)
  if (imageUrl) return <img src={imageUrl} alt={`${item.title}海报`} className="aspect-[2/3] w-full object-cover" loading="lazy" />

  return (
    <div
      role="img"
      aria-label={`${item.title}海报`}
      className={cn(
        "relative isolate flex aspect-[2/3] overflow-hidden bg-muted p-3 text-muted-foreground"
      )}
    >
      <div className="absolute inset-0 -z-10 bg-gradient-to-br from-background/40 via-transparent to-foreground/5" />
      <div className="flex h-full w-full flex-col items-center justify-center gap-3 text-center">
        <FilmIcon className="size-7 opacity-50" aria-hidden="true" />
        <p className="line-clamp-3 px-1 text-sm font-medium leading-snug">{item.title}</p>
      </div>
    </div>
  )
}

function LibraryPoster({ item }: { item: EmbyMediaItem }) {
  const imageUrl = useEmbyImageUrl(item.id)
  return imageUrl ? <img src={imageUrl} alt="" className="size-full object-cover" loading="lazy" /> : <div className="flex size-full items-center justify-center bg-muted"><FilmIcon className="size-5 opacity-40" aria-hidden="true" /></div>
}

function LibraryArtwork({ libraryId, items, type }: { libraryId: string; items: EmbyMediaItem[]; type: string }) {
  const libraryImageUrl = useEmbyImageUrl(libraryId)
  const Icon = libraryIcons[type as keyof typeof libraryIcons] ?? Layers3Icon
  return (
    <div className="relative aspect-[16/9] w-full overflow-hidden bg-muted text-muted-foreground">
      {libraryImageUrl ? <img src={libraryImageUrl} alt="" className="size-full object-cover" loading="lazy" /> : items.length > 0 ? (
        <div className="grid size-full overflow-hidden" style={{ gridTemplateColumns: `repeat(${Math.min(items.length, 4)}, minmax(0, 1fr))` }}>
          {items.slice(0, 4).map((item) => <div key={item.id} className="min-w-0 overflow-hidden"><LibraryPoster item={item} /></div>)}
        </div>
      ) : (
        <div className="flex size-full items-center justify-center"><Icon className="size-7" aria-hidden="true" /></div>
      )}
    </div>
  )
}

function MediaCard({
  item,
  onOpen,
  resume,
}: {
  item: EmbyMediaItem
  onOpen: (item: EmbyMediaItem) => void
  resume?: EmbyResumeItem
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      className="group flex h-auto w-full min-w-0 flex-col items-stretch justify-start overflow-hidden rounded-xl border border-border bg-card p-0 text-left font-normal whitespace-normal text-foreground shadow-sm transition-all hover:-translate-y-0.5 hover:bg-card hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring"
      onClick={() => onOpen(item)}
      aria-label={`${resume ? "继续播放" : "查看详情"}《${item.title}》`}
    >
      <div className="overflow-hidden">
        <div className="relative">
          <PosterArtwork item={item} />
          <Badge variant="secondary" className="absolute left-2 top-2 bg-black/55 text-white">{item.kind}</Badge>
          {item.rating !== "—" && <Badge variant="secondary" className="absolute right-2 top-2 gap-1 bg-black/55 text-amber-200"><StarIcon className="size-3 fill-current" />{item.rating}</Badge>}
        </div>
          <div className="flex min-w-0 items-center justify-between gap-2 p-2.5">
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold">{item.title}</p>
              <p className="mt-1 truncate text-[11px] text-muted-foreground">
                {resume ? (resume.remaining ? `${resume.resumeLabel} · ${resume.remaining}` : resume.resumeLabel) : `${item.year} · ${item.kind}`}
              </p>
            </div>
          </div>
      </div>
    </Button>
  )
}

export function EmbyDashboard() {
  const [selectedLibrary, setSelectedLibrary] = useState<string | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [notice, setNotice] = useState("")
  const [dashboard, setDashboard] = useState<Awaited<ReturnType<typeof mediaApi.embyDashboard>> | null>(null)
  const openMediaDetail = useMediaDetail()

  useEffect(() => {
    mediaApi.embyDashboard().then(setDashboard).catch((error: unknown) => setNotice(error instanceof Error ? error.message : "Emby 概览加载失败"))
  }, [])

  const embyLibraries = useMemo(() => dashboard?.libraries ?? [], [dashboard])
  const recentlyAdded = useMemo(() => dashboard?.recentlyAdded ?? [], [dashboard])
  const continueWatching = useMemo(() => dashboard?.continueWatching ?? [], [dashboard])

  const visibleLibraries = embyLibraries
  const visibleRecent = useMemo(
    () => recentlyAdded.filter((item) =>
      (!selectedLibrary || item.libraryId === selectedLibrary)
    ),
    [recentlyAdded, selectedLibrary]
  )
  const visibleResume = useMemo(
    () => continueWatching.filter((item) =>
      (!selectedLibrary || item.libraryId === selectedLibrary)
    ),
    [continueWatching, selectedLibrary]
  )
  const stats = dashboard?.stats.all ?? { movies: 0, series: 0, episodes: 0, plays: 0, viewers: 0, hours: 0 }
  const selectedLibraryTitle = embyLibraries.find((library) => library.id === selectedLibrary)?.title
  const cacheDescription = dashboard
    ? `缓存于 ${formatTime(new Date(dashboard.updatedAt))} · 失效后进入页面时自动更新。`
    : "缓存失效后进入页面时自动更新。"
  function refreshCache() {
    if (isRefreshing) return
    setIsRefreshing(true)
    setNotice("")
    mediaApi.embyDashboard(true).then((data) => {
      setDashboard(data)
      setNotice("Emby 缓存已刷新。")
    }).catch(() => setNotice("Emby 概览刷新失败")).finally(() => setIsRefreshing(false))
  }

  function openMedia(item: EmbyMediaItem) {
    openMediaDetail({
      title: item.title,
      originalTitle: item.title,
      kind: item.kind,
      year: item.year,
      rating: item.rating,
      mediaId: item.id,
      source: "emby",
      sourceId: item.id,
      sourceLabel: "Emby 媒体库",
      mediaType: item.kind === "电影" ? "movie" : item.kind === "纪录片" ? "documentary" : "tv",
      summary: item.summary,
      palette: item.palette,
      artwork: item.artworkTitle,
    })
    setNotice("")
  }

  return (
    <div className="flex flex-col gap-6 p-5 sm:p-7 lg:p-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="min-w-0 text-sm text-muted-foreground">{cacheDescription}</p>
        <Button variant="secondary" onClick={refreshCache} disabled={isRefreshing} className="shrink-0">
          <RefreshCwIcon data-icon="inline-start" className={isRefreshing ? "animate-spin" : undefined} />
          {isRefreshing ? "刷新中" : "刷新缓存"}
        </Button>
      </div>
      {notice && <Alert className="border-chart-2/30 bg-chart-2/5"><CheckIcon /><AlertDescription>{notice}</AlertDescription></Alert>}

      <section aria-label="媒体统计">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          {statDefinitions.map((stat) => {
            return (
              <Card key={stat.key} className="border-border/70 p-0 shadow-none">
                <CardContent className="flex h-20 flex-col justify-center gap-0.5 px-4 py-2">
                  <CardDescription className="text-xs">{stat.label}</CardDescription>
                  <CardTitle className="text-2xl font-semibold tabular-nums tracking-tight">{stats[stat.key].toLocaleString("zh-CN")}</CardTitle>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </section>

      <Card className="border-border/70 shadow-none">
        <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2"><Layers3Icon className="size-4 text-muted-foreground" />我的媒体库</CardTitle>
            <CardDescription>选择媒体库，筛选最近入库和继续播放内容。</CardDescription>
          </div>
          {selectedLibrary && <Button variant="ghost" size="sm" onClick={() => setSelectedLibrary(null)}>显示全部</Button>}
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          {visibleLibraries.map((library) => {
            const isSelected = selectedLibrary === library.id
            const covers = recentlyAdded.filter((item) => item.libraryId === library.id).slice(0, 4)
            return (
              <Button
                key={library.id}
                type="button"
                variant="ghost"
                aria-pressed={isSelected}
                onClick={() => setSelectedLibrary((current) => current === library.id ? null : library.id)}
                className="flex h-auto w-full min-w-0 flex-col items-stretch justify-start rounded-xl p-0 text-left font-normal whitespace-normal text-foreground focus-visible:ring-offset-2"
              >
                <Card className={cn("h-full overflow-hidden border-border/70 p-0 shadow-none transition-colors hover:bg-muted/50", isSelected && "border-primary/50 bg-primary/5 ring-2 ring-primary/20")}>
                  <CardContent className="p-0">
                    <LibraryArtwork libraryId={library.id} items={covers} type={library.type} />
                    <span className="flex min-w-0 items-center justify-between gap-2 p-2.5">
                      <span className="truncate text-sm font-semibold">{library.title}</span>
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{library.count.toLocaleString("zh-CN")}</span>
                    </span>
                  </CardContent>
                </Card>
              </Button>
            )
          })}
        </CardContent>
      </Card>

      <div className="grid gap-6 2xl:grid-cols-2">
        <MediaSection
          title="最近入库"
          description={selectedLibraryTitle ? `${selectedLibraryTitle} · 最近添加` : "刚刚加入媒体库的内容"}
          items={visibleRecent}
          onOpen={openMedia}
          emptyMessage="当前筛选条件下没有最近入库内容。"
        />
        <MediaSection
          title="继续播放"
          description={selectedLibraryTitle ? `${selectedLibraryTitle} · 接着上次继续观看` : "从上次停止的位置接着观看"}
          items={visibleResume}
          onOpen={openMedia}
          emptyMessage="当前筛选条件下暂无继续播放内容。"
          resume
        />
      </div>

    </div>
  )
}

function MediaSection({
  title,
  description,
  items,
  onOpen,
  emptyMessage,
  resume = false,
}: {
  title: string
  description: string
  items: EmbyMediaItem[] | EmbyResumeItem[]
  onOpen: (item: EmbyMediaItem) => void
  emptyMessage: string
  resume?: boolean
}) {
  return (
    <Card className="border-border/70 shadow-none">
      <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
        <div className="space-y-1"><CardTitle>{title}</CardTitle><CardDescription>{description}</CardDescription></div>
        {items.length > 0 && <Badge variant="outline" className="font-normal tabular-nums">{items.length} 项</Badge>}
      </CardHeader>
      <CardContent>
        {items.length > 0 ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
            {items.slice(0, 10).map((item) => (
              <MediaCard key={item.id} item={item} onOpen={onOpen} resume={resume ? item as EmbyResumeItem : undefined} />
            ))}
          </div>
        ) : (
          <div className="flex min-h-48 flex-col items-center justify-center gap-2 rounded-xl border border-dashed bg-muted/20 px-6 text-center">
            <FilmIcon className="size-5 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">{emptyMessage}</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}










