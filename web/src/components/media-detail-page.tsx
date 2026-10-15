import { TVSubscribeButton } from "@/components/tv-subscribe-button"
import {
  ArrowLeftIcon,
  PlayIcon,
  SearchIcon,
  StarIcon,
  UserRoundIcon,
} from "lucide-react"
import { cn } from "cn"
import type { MediaDetailRecord } from "@/components/media-detail-context"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

import { MediaPoster } from "@/components/media-poster"
import {
  formatRegion,
  presentTitle,
  mediaImageUrl,
} from "@/lib/media-presentation"

export function MediaDetailPage({
  media,
  onBack,
  onResourceSearch,
}: {
  media: MediaDetailRecord
  onBack: () => void
  onResourceSearch: (keyword: string) => void
}) {
  const { title, subtitle } = presentTitle(media)
  const poster = mediaImageUrl(media.posterPath)
  const region = formatRegion(media.originCountries, media.region)
  const imdb = media.externalIds?.imdb
  const isSeries = media.kind !== "电影" && media.kind !== "纪录片"
  const rating = media.rating ?? "—"
  const source = media.sourceLabel ?? media.source ?? "媒体库"
  const summary = media.summary ?? "暂无简介。"
  const cast = media.credits ?? []

  return (
    <div className="flex flex-col gap-4 p-4 sm:gap-5 sm:p-6 lg:p-7">
      <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeftIcon data-icon="inline-start" />
          返回列表
        </Button>
        <span className="truncate">{source} / 作品详情</span>
      </div>

      <section
        className={cn(
          "relative isolate overflow-hidden rounded-3xl border bg-gradient-to-br p-4 text-white shadow-md sm:p-6 lg:p-7",
          media.palette ?? "from-indigo-950 via-slate-900 to-blue-950"
        )}
      >
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-black/75 via-black/55 to-black/20" />
        <div className="absolute top-0 -right-12 -z-10 size-80 rounded-full border-[36px] border-white/5" />
        <div className="flex w-full max-w-7xl flex-col gap-5 sm:flex-row sm:items-center sm:gap-7">
          <div className="relative aspect-[2/3] w-32 shrink-0 overflow-hidden rounded-2xl border border-white/20 bg-black/20 shadow-lg sm:w-40 lg:w-44">
            {poster && (
              <MediaPoster
                src={poster}
                alt={title}
                className="absolute inset-0 size-full object-cover"
                loading="eager"
              />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold tracking-[0.18em] text-white/70 uppercase">
              {source} · {media.kind}
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight break-words sm:text-4xl lg:text-5xl">
              {title}
              {media.year && (
                <span className="ml-3 text-xl font-semibold text-white/70 sm:text-2xl">
                  ({media.year})
                </span>
              )}
            </h1>
            {subtitle && (
              <p className="mt-2 text-sm text-white/70">{subtitle}</p>
            )}
            {media.stale && (
              <p className="mt-2 text-xs text-white/70">缓存数据（待更新）</p>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              <Badge
                variant="secondary"
                className="gap-1 bg-black/35 text-amber-200"
              >
                <StarIcon className="size-3 fill-current" />
                {rating} · {media.ratings?.[0]?.source ?? "评分"}
              </Badge>
              {region && (
                <Badge variant="secondary" className="bg-black/35 text-white">
                  {region}
                </Badge>
              )}
              {media.year && (
                <Badge variant="secondary" className="bg-black/35 text-white">
                  {media.year}
                </Badge>
              )}
              {media.status && (
                <Badge variant="secondary" className="bg-black/35 text-white">
                  {media.status}
                </Badge>
              )}
              {media.episodeInfo && (
                <Badge variant="secondary" className="bg-black/35 text-white">
                  {media.episodeInfo}
                </Badge>
              )}
            </div>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-white/80">
              {summary}
            </p>
            {media.detailLoading && (
              <p role="status" className="mt-2 text-xs text-white/65">
                正在补充详情和演职员信息…
              </p>
            )}
            {media.detailError && (
              <p role="status" className="mt-2 text-xs text-amber-200">
                详情暂时无法加载：{media.detailError}
              </p>
            )}
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              {(media.mediaType === "tv" ||
                media.kind === "剧集" ||
                media.kind === "电视剧") &&
                (media.externalIds?.tmdb ||
                  (media.provider === "tmdb" || media.source === "tmdb"
                    ? (media.providerId ?? media.sourceId)
                    : undefined)) && (
                  <TVSubscribeButton
                    key={media.mediaId ?? media.title}
                    title={title}
                    tmdbId={
                      media.externalIds?.tmdb ??
                      media.providerId ??
                      media.sourceId ??
                      ""
                    }
                  />
                )}
              {(media.actionLabel || media.onAction) && (
                <Button
                  variant="secondary"
                  onClick={media.onAction ?? (() => undefined)}
                >
                  <PlayIcon data-icon="inline-start" />
                  {media.actionLabel ?? "加入片单"}
                </Button>
              )}
              <Button
                variant="secondary"
                onClick={() => onResourceSearch(title)}
              >
                <SearchIcon data-icon="inline-start" />
                搜网盘资源
              </Button>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-[minmax(250px,340px)_minmax(0,1fr)]">
        <Card className="border-border/70 shadow-none">
          <CardHeader>
            <p className="text-[10px] font-semibold tracking-[0.18em] text-primary uppercase">
              Work profile
            </p>
            <CardTitle>作品资料</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            {[
              ["类型", media.kind],
              ["原名", subtitle ?? "—"],
              ["年份", media.year ?? "—"],
              ["地区", region || "—"],
              ["来源", source],
              ["状态", media.status ?? "—"],
            ].map(([label, value]) => (
              <div
                key={label}
                className="flex justify-between gap-3 border-b pb-2 last:border-0"
              >
                <span className="text-muted-foreground">{label}</span>
                <span className="text-right font-medium">{value}</span>
              </div>
            ))}
            {(media.provider ?? media.source) === "anilist" &&
            media.titles?.synonyms?.length ? (
              <div className="text-sm">
                <span className="text-muted-foreground">别名：</span>
                {media.titles.synonyms.slice(0, 5).join("、")}
              </div>
            ) : null}
            {imdb && (
              <div className="flex justify-between gap-3 border-b pb-2">
                <span className="text-muted-foreground">IMDb</span>
                <a
                  className="font-medium text-primary hover:underline"
                  href={`https://www.imdb.com/title/${encodeURIComponent(imdb)}/`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {imdb}
                </a>
              </div>
            )}
            <div className="flex flex-wrap gap-2 pt-1">
              {(media.genres?.length ? media.genres : ["暂无标签"]).map(
                (genre) => (
                  <Badge key={genre} variant="outline">
                    {genre}
                  </Badge>
                )
              )}
            </div>
          </CardContent>
        </Card>

        <div className="flex min-w-0 flex-col gap-4">
          {(cast.length > 0 || media.detailLoading || media.detailError) && (
            <Card className="border-border/70 shadow-none">
              <CardHeader>
                <p className="text-[10px] font-semibold tracking-[0.18em] text-primary uppercase">
                  Cast
                </p>
                <CardTitle>主要演职员</CardTitle>
              </CardHeader>
              {cast.length > 0 ? (
                <CardContent className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 2xl:grid-cols-12">
                  {cast.map((person, index) => (
                    <div
                      key={`${person.personId ?? person.name}:${person.role}:${index}`}
                      className="overflow-hidden rounded-xl border bg-card"
                    >
                      <div className="relative aspect-[4/5] overflow-hidden bg-muted">
                        {person.profilePath ? (
                          <MediaPoster
                            src={
                              mediaImageUrl(person.profilePath, "w185") ??
                              person.profilePath
                            }
                            alt={`${person.name} 头像`}
                            className="absolute inset-0 size-full object-cover object-top"
                            loading="lazy"
                            fallbackLabel="暂无头像"
                          />
                        ) : (
                          <div className="flex size-full items-center justify-center text-muted-foreground">
                            <UserRoundIcon
                              className="size-8"
                              aria-hidden="true"
                            />
                            <span className="sr-only">暂无头像</span>
                          </div>
                        )}
                      </div>
                      <div className="space-y-0.5 p-1.5">
                        <p
                          className="truncate text-xs font-semibold"
                          title={person.name}
                        >
                          {person.name}
                        </p>
                        <p
                          className="truncate text-[10px] text-muted-foreground"
                          title={person.role}
                        >
                          {person.role}
                        </p>
                      </div>
                    </div>
                  ))}
                </CardContent>
              ) : (
                <CardContent className="text-sm text-muted-foreground">
                  {media.detailLoading
                    ? "正在加载演职员信息…"
                    : "暂无演职员信息。"}
                </CardContent>
              )}
            </Card>
          )}

          {isSeries && (media.seasons?.length || media.episodeInfo) && (
            <Card className="border-border/70 shadow-none">
              <CardHeader>
                <p className="text-[10px] font-semibold tracking-[0.18em] text-primary uppercase">
                  Seasons
                </p>
                <CardTitle>季与集</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2">
                {(media.seasons?.length
                  ? media.seasons.map(
                      (season) => season.name ?? `第 ${season.seasonNumber} 季`
                    )
                  : media.episodeInfo
                    ? [media.episodeInfo]
                    : []
                ).map((season, index) => (
                  <div
                    key={season}
                    className="flex items-center gap-3 rounded-xl border p-3"
                  >
                    <div
                      className={cn(
                        "flex size-14 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br text-sm font-bold text-white",
                        media.palette ?? "from-indigo-700 to-slate-950"
                      )}
                    >
                      {media.seasons?.[index]
                        ? `S${media.seasons[index].seasonNumber}`
                        : "EP"}
                    </div>
                    <div>
                      <p className="text-sm font-semibold">{season}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {media.seasons?.[index]?.episodeCount
                          ? `${media.seasons[index].episodeCount} 集`
                          : (media.episodeInfo ?? "集数信息待补充")}
                      </p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
