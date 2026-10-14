import { useEffect, useMemo, useState } from "react"
import {
  CheckIcon,
  Clock3Icon,
  DownloadIcon,
  PauseIcon,
  PlayIcon,
  RotateCwIcon,
  PlusIcon,
  SearchIcon,
  StarIcon,
} from "lucide-react"
import { cn } from "cn"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { animeApi, presentAnime, type AnimeSubscription } from "@/lib/anime-api"
import { AddAnimeSubscription } from "@/components/add-anime-subscription"
import { AnimeDownloadDialog } from "@/components/anime-download-dialog"
import { useMediaDetail } from "@/components/media-detail-context"

const weekdays = [
  "周一",
  "周二",
  "周三",
  "周四",
  "周五",
  "周六",
  "周日",
] as const
type WeekdayFilter = "全部" | (typeof weekdays)[number]

function AnimeCard({
  anime,
  onOpen,
  onToggleStatus,
  onRefresh,
  onDownloads,
  refreshing,
}: {
  anime: AnimeSubscription
  onOpen: (anime: AnimeSubscription) => void
  onToggleStatus: (anime: AnimeSubscription) => void
  onRefresh: (anime: AnimeSubscription) => void
  onDownloads: (anime: AnimeSubscription) => void
  refreshing: boolean
}) {
  const isUpdating = anime.status === "更新中"

  return (
    <Card className="group overflow-hidden border-border/70 p-0 transition-all hover:-translate-y-0.5 hover:shadow-md">
      <button
        type="button"
        onClick={() => onOpen(anime)}
        className="relative block w-full text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={"查看《" + anime.title + "》订阅详情"}
      >
        <div
          className={cn(
            "relative flex aspect-[3/4] flex-col justify-between overflow-hidden bg-gradient-to-br p-3 text-white",
            anime.palette
          )}
        >
          {anime.saved?.poster && (
            <img
              src={anime.saved.poster}
              alt=""
              loading="lazy"
              className="absolute inset-0 size-full object-cover"
            />
          )}
          <div className="absolute -top-10 -right-10 size-40 rounded-full border-[20px] border-white/10" />
          <div className="absolute -bottom-12 -left-8 size-36 rounded-full bg-white/10 blur-2xl" />
          <div className="absolute inset-x-4 top-1/2 h-px -rotate-12 bg-white/25" />
          <div className="relative flex items-start justify-between gap-2">
            <Badge
              variant="secondary"
              className="bg-black/35 text-white backdrop-blur"
            >
              {anime.status}
            </Badge>
            <Badge
              variant="secondary"
              className="gap-1 bg-black/35 text-amber-200 backdrop-blur"
            >
              <StarIcon className="size-3 fill-current" />
              {anime.rating}
            </Badge>
          </div>
          <div className="relative">
            <p className="text-3xl leading-[1.05] font-black tracking-tight whitespace-pre-line sm:text-4xl">
              {anime.artwork}
            </p>
            <p className="mt-2 line-clamp-1 text-[10px] tracking-[0.13em] text-white/75 uppercase">
              {anime.originalTitle}
            </p>
          </div>
          <Badge className="absolute right-3 bottom-3 bg-background/90 text-foreground">
            RSS 订阅
          </Badge>
        </div>
      </button>
      <CardContent className="flex flex-col gap-3 p-3">
        <div className="min-w-0">
          <button
            type="button"
            onClick={() => onOpen(anime)}
            className="block w-full truncate text-left text-sm font-semibold hover:text-primary"
          >
            {anime.title}
          </button>
          <p className="mt-1 text-xs text-muted-foreground">
            {anime.saved
              ? anime.totalEpisodes
                ? anime.saved.lastCheckedAt
                  ? `已发现 ${anime.saved.knownEpisodes?.filter((episode) => episode >= 1 && episode <= (anime.totalEpisodes ?? 0)).length ?? 0} / ${anime.totalEpisodes} 集`
                  : `共 ${anime.totalEpisodes} 集 · 尚未同步`
                : anime.saved.lastCheckedAt
                  ? `资源更新至 ${anime.currentEpisode} 集 · 总集数未知`
                  : "总集数未知 · 尚未同步"
              : anime.totalEpisodes
                ? "第 " +
                  anime.currentEpisode +
                  " / " +
                  anime.totalEpisodes +
                  " 集"
                : "更新至第 " + anime.currentEpisode + " 集"}
          </p>
        </div>
        <div className="flex items-center justify-between gap-2 rounded-lg bg-muted/50 px-2.5 py-2 text-xs">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <Clock3Icon className="size-3.5" />
            {anime.nextUpdate}
          </span>
          <span className="font-medium">{anime.nextEpisode}</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 gap-1">
            {anime.genres.slice(0, 2).map((genre) => (
              <Badge
                key={genre}
                variant="outline"
                className="max-w-20 truncate text-[10px] font-normal"
              >
                {genre}
              </Badge>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              disabled={!anime.saved}
              onClick={() => onDownloads(anime)}
              aria-label={`查看《${anime.title}》下载记录`}
              title="下载记录与范围"
            >
              <DownloadIcon data-icon="inline-start" />
            </Button>
            {anime.status !== "已完结" && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onToggleStatus(anime)}
                aria-label={isUpdating ? "暂停订阅" : "恢复订阅"}
              >
                {isUpdating ? (
                  <PauseIcon data-icon="inline-start" />
                ) : (
                  <PlayIcon data-icon="inline-start" />
                )}
                {isUpdating ? "暂停" : "恢复"}
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon-sm"
              disabled={refreshing || anime.status === "已完结"}
              onClick={() => onRefresh(anime)}
              aria-label={`刷新《${anime.title}》订阅`}
              title={
                anime.status === "已完结" ? "已完结，无需刷新" : "刷新订阅"
              }
            >
              <RotateCwIcon
                data-icon="inline-start"
                className={refreshing ? "animate-spin" : undefined}
              />
            </Button>
          </div>
        </div>
        {anime.saved?.lastError && (
          <p role="status" className="text-xs text-destructive">
            {anime.saved.lastError}
          </p>
        )}
        {anime.saved?.metadataError && (
          <p className="text-xs text-muted-foreground">
            {anime.saved.metadataError}
          </p>
        )}
      </CardContent>
    </Card>
  )
}

export function AnimeSubscriptionsPage() {
  const [subscriptions, setSubscriptions] = useState<AnimeSubscription[]>([])
  const [weekdayFilter, setWeekdayFilter] = useState<WeekdayFilter>("全部")
  const [queryDraft, setQueryDraft] = useState("")
  const [query, setQuery] = useState("")
  const [refreshing, setRefreshing] = useState(false)
  const [notice, setNotice] = useState("")
  const [refreshingIds, setRefreshingIds] = useState<Set<string>>(
    () => new Set()
  )
  const [adding, setAdding] = useState(false)
  const [downloadAnime, setDownloadAnime] = useState<AnimeSubscription | null>(
    null
  )
  const openMediaDetail = useMediaDetail()

  useEffect(() => {
    const controller = new AbortController()
    animeApi
      .list(controller.signal)
      .then((items) => setSubscriptions(items.map(presentAnime)))
      .catch(() => {
        if (!controller.signal.aborted)
          setNotice("订阅列表加载失败，请确认已连接真实后端")
      })
    return () => controller.abort()
  }, [])

  const visibleSubscriptions = useMemo(() => {
    const term = query.toLocaleLowerCase()
    const result = subscriptions.filter((item) => {
      const weekdayMatches =
        weekdayFilter === "全部" ||
        item.saved?.week === weekdays.indexOf(weekdayFilter) + 1
      const queryMatches =
        !term ||
        (item.title + " " + item.originalTitle + " " + item.genres.join(" "))
          .toLocaleLowerCase()
          .includes(term)
      return weekdayMatches && queryMatches
    })
    return result.sort((a, b) => {
      return (b.saved?.updatedAt ?? "").localeCompare(a.saved?.updatedAt ?? "")
    })
  }, [subscriptions, weekdayFilter, query])

  async function toggleStatus(anime: AnimeSubscription) {
    const nextStatus = anime.status === "更新中" ? "已暂停" : "更新中"
    try {
      const updated = presentAnime(
        await animeApi.enable(anime.id, nextStatus === "更新中")
      )
      setSubscriptions((current) =>
        current.map((item) => (item.id === anime.id ? updated : item))
      )
      setNotice(
        anime.title + (nextStatus === "已暂停" ? " 已暂停订阅" : " 已恢复订阅")
      )
    } catch {
      setNotice("更新订阅状态失败")
    }
  }

  async function refreshSubscription(anime: AnimeSubscription) {
    if (refreshingIds.has(anime.id) || anime.saved?.completed) return
    setRefreshingIds((current) => new Set(current).add(anime.id))
    try {
      const result = presentAnime(await animeApi.refresh(anime.id))
      setSubscriptions((current) =>
        current.map((item) => (item.id === anime.id ? result : item))
      )
      setNotice(
        `${anime.title} 已刷新${result.saved?.completed ? "，资源已全部更新" : ""}`
      )
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "订阅刷新失败")
      // Fetch persisted last-error fields while preserving prior resources.
      try {
        const saved = (await animeApi.list()).find(
          (item) => item.id === anime.id
        )
        if (saved) {
          const updated = presentAnime(saved)
          setSubscriptions((current) =>
            current.map((item) => (item.id === anime.id ? updated : item))
          )
        }
      } catch {
        /* Keep current cards if network is unavailable. */
      }
    } finally {
      setRefreshingIds((current) => {
        const next = new Set(current)
        next.delete(anime.id)
        return next
      })
    }
  }
  function openAnime(anime: AnimeSubscription) {
    openMediaDetail({
      title: anime.title,
      originalTitle: anime.originalTitle,
      kind: "动画",
      year: anime.saved?.releaseDate
        ? Number(anime.saved.releaseDate.slice(0, 4))
        : undefined,
      rating: anime.rating,
      mediaId: `bangumi:anime:${anime.saved?.bangumiId ?? anime.id}`,
      source: "bangumi",
      sourceId: anime.saved?.bangumiId ?? anime.id,
      sourceLabel: "RSS 订阅",
      mediaType: "anime",
      genres: anime.genres,
      summary: anime.description,
      palette: anime.palette,
      artwork: anime.artwork,
      status: anime.status,
      episodeInfo: anime.saved?.lastCheckedAt
        ? anime.nextEpisode + "（不是下载进度）"
        : "尚未同步资源",
      actionLabel:
        anime.status === "更新中"
          ? "暂停订阅"
          : anime.status === "已暂停"
            ? "恢复订阅"
            : "订阅已完结",
      onAction:
        anime.status === "已完结" ? undefined : () => toggleStatus(anime),
    })
  }

  function refresh() {
    if (refreshing) return
    setRefreshing(true)
    setNotice("")
    animeApi
      .list()
      .then((items) => {
        setSubscriptions(items.map(presentAnime))
        setNotice("订阅列表已刷新")
      })
      .catch(() => setNotice("刷新失败"))
      .finally(() => setRefreshing(false))
  }

  function submitSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setQuery(queryDraft.trim())
  }

  function clearSearch() {
    setQuery("")
    setQueryDraft("")
  }

  return (
    <div className="flex flex-col gap-4 p-4 sm:gap-5 sm:p-6 lg:p-7">
      <AddAnimeSubscription
        open={adding}
        onOpenChange={setAdding}
        onCreated={refresh}
      />
      {downloadAnime && (
        <AnimeDownloadDialog
          key={downloadAnime.id}
          anime={downloadAnime}
          onClose={() => setDownloadAnime(null)}
        />
      )}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className="text-sm text-muted-foreground">
          管理番剧 RSS 与匹配规则。
        </p>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => setAdding(true)}>
            <PlusIcon data-icon="inline-start" />
            添加订阅
          </Button>
          <span className="text-xs text-muted-foreground">
            {subscriptions.length} 个订阅
          </span>
        </div>
      </div>

      <Card className="border-border/70 shadow-none">
        <CardContent className="flex flex-col gap-3 p-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-xs font-medium text-muted-foreground">
                更新日
              </span>
              <Button
                type="button"
                size="sm"
                variant={weekdayFilter === "全部" ? "default" : "ghost"}
                className="h-8 rounded-full px-2"
                onClick={() => setWeekdayFilter("全部")}
              >
                全部
              </Button>
              {weekdays.map((weekday) => {
                const count = subscriptions.filter(
                  (item) => item.saved?.week === weekdays.indexOf(weekday) + 1
                ).length
                return (
                  <Button
                    key={weekday}
                    type="button"
                    size="sm"
                    variant={weekdayFilter === weekday ? "default" : "ghost"}
                    className="h-8 rounded-full px-2"
                    onClick={() => setWeekdayFilter(weekday)}
                  >
                    {weekday}
                    <span className="ml-1 tabular-nums opacity-70">
                      {count}
                    </span>
                  </Button>
                )
              })}
            </div>
            <form
              className="ml-auto flex w-full flex-wrap items-center justify-end gap-2 xl:w-auto xl:flex-nowrap"
              onSubmit={submitSearch}
            >
              <div className="relative min-w-0 flex-1 xl:w-44 xl:flex-none">
                <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  aria-label="搜索动漫订阅"
                  value={queryDraft}
                  onChange={(event) => setQueryDraft(event.target.value)}
                  placeholder="搜索作品名称或题材"
                  className="h-9 pl-9"
                />
              </div>
              <Button type="submit" size="sm">
                搜索
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={clearSearch}
              >
                清空
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={refresh}
                disabled={refreshing}
              >
                <RotateCwIcon
                  data-icon="inline-start"
                  className={refreshing ? "animate-spin" : undefined}
                />
                {refreshing ? "刷新中" : "刷新"}
              </Button>
            </form>
          </div>
          <p className="border-t pt-2 text-xs text-muted-foreground">
            每天北京时间 04:00 更新当天及前一天未完结订阅；未配置 115
            时自动任务停用。卡片刷新读取资源，下载和整理尚未接入。
          </p>
        </CardContent>
      </Card>

      {notice && (
        <Alert>
          <CheckIcon />
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}

      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium tracking-[0.16em] text-muted-foreground uppercase">
            Subscriptions
          </p>
          <h2 className="mt-1 text-lg font-semibold tracking-tight">
            {weekdayFilter === "全部" ? "我的动漫订阅" : weekdayFilter + "更新"}
          </h2>
        </div>
        <Badge variant="secondary">{visibleSubscriptions.length} 项</Badge>
      </div>

      {visibleSubscriptions.length ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5 2xl:grid-cols-6">
          {visibleSubscriptions.map((anime) => (
            <AnimeCard
              key={anime.id}
              anime={anime}
              onOpen={openAnime}
              onToggleStatus={toggleStatus}
              onRefresh={(anime) => void refreshSubscription(anime)}
              onDownloads={setDownloadAnime}
              refreshing={refreshingIds.has(anime.id)}
            />
          ))}
        </div>
      ) : (
        <div className="flex min-h-56 flex-col items-center justify-center gap-2 rounded-xl border border-dashed bg-muted/20 px-6 text-center">
          <p className="text-sm font-medium">没有找到符合条件的订阅</p>
          <p className="text-xs text-muted-foreground">
            试试清除搜索内容或切换更新日。
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setWeekdayFilter("全部")
              clearSearch()
            }}
          >
            清除筛选
          </Button>
        </div>
      )}
    </div>
  )
}
