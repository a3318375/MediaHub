import { TVSubscribeButton } from "@/components/tv-subscribe-button"
import type { ReactNode } from "react"
import { HeartIcon, SearchIcon } from "lucide-react"
import type { MediaSummary } from "@/lib/media-contract"
import {
  formatRegion,
  mediaImageUrl,
  presentTitle,
} from "@/lib/media-presentation"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { MediaPoster } from "@/components/media-poster"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"

const mediaTypeLabels: Record<string, string> = {
  movie: "电影",
  tv: "剧集",
  anime: "动画",
  documentary: "纪录片",
}

function UnavailableAction({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            tabIndex={0}
            aria-label={`${label}功能暂未接入`}
            className="inline-flex rounded-md outline-none focus-visible:ring-2 focus-visible:ring-white/80"
          />
        }
      >
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          disabled
          tabIndex={-1}
          aria-hidden="true"
          className="size-8 text-white/80 disabled:opacity-75"
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}功能暂未接入</TooltipContent>
    </Tooltip>
  )
}

export function MediaPosterCard({
  item,
  onOpen,
  onResourceSearch,
  sourceLabel,
  rank,
  className,
}: {
  item: MediaSummary
  onOpen: () => void
  onResourceSearch: (keyword: string) => void
  sourceLabel?: string
  rank?: number
  className?: string
}) {
  const title = presentTitle(item)
  const poster = mediaImageUrl(item.posterPath)
  const rating = item.ratings?.[0]?.value
  const typeLabel = mediaTypeLabels[item.mediaType] ?? item.mediaType
  const region = formatRegion(item.originCountries, item.region)
  const metadata = [item.year, typeLabel, region, sourceLabel]
    .filter(Boolean)
    .join(" · ")

  return (
    <article className={cn("group/poster w-36 shrink-0 sm:w-40", className)}>
      <div className="relative isolate aspect-[2/3] overflow-hidden rounded-xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-950 ring-1 ring-border/70">
        {poster ? (
          <MediaPoster
            src={poster}
            alt={title.title}
            loading="lazy"
            className="absolute inset-0 size-full object-cover transition-transform duration-200 ease-out group-focus-within/poster:scale-[1.015] group-hover/poster:scale-[1.025] motion-reduce:transition-none"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center px-3 text-center text-xs text-white/60">
            暂无海报
          </div>
        )}

        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/25 via-transparent to-black/5" />

        <div className="pointer-events-none absolute inset-x-2 top-2 z-20 flex items-start justify-between gap-2">
          <Badge className="max-w-[65%] truncate rounded-full border-0 bg-slate-950/65 px-3 text-white shadow-none">
            {rank ? `#${rank}` : typeLabel}
          </Badge>
          {rating !== undefined && (
            <Badge className="shrink-0 rounded-full border-0 bg-purple-950/65 px-3 text-white shadow-none">
              {rating.toFixed(1)}
            </Badge>
          )}
        </div>

        <button
          type="button"
          onClick={onOpen}
          className="absolute inset-0 z-10 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset"
          aria-label={
            rank
              ? `查看第 ${rank} 名《${title.title}》详情`
              : `查看《${title.title}》详情`
          }
        />

        <div className="media-poster-overlay pointer-events-none absolute inset-x-0 bottom-0 z-20 h-2/3 bg-gradient-to-t from-slate-950/90 via-slate-950/65 via-55% to-transparent opacity-0 transition-opacity duration-200 ease-out group-focus-within/poster:opacity-100 group-hover/poster:opacity-100 motion-reduce:transition-none">
          <div className="absolute inset-x-0 bottom-0 flex h-3/4 flex-col overflow-hidden px-2 pb-2">
            {metadata && (
              <p className="truncate text-[10px] leading-tight text-white/70">
                {metadata}
              </p>
            )}
            <h3 className="line-clamp-2 text-sm leading-tight font-bold text-white">
              {title.title}
            </h3>
            {item.overview && (
              <p className="mt-1 line-clamp-2 text-[11px] leading-tight text-white/80">
                {item.overview}
              </p>
            )}
            <div className="pointer-events-auto mt-auto flex shrink-0 items-center justify-between pt-1">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`搜索《${title.title}》资源`}
                className="size-8 text-white/80 hover:text-white"
                onClick={() => onResourceSearch(title.title)}
              >
                <SearchIcon />
              </Button>
              <UnavailableAction label="收藏">
                <HeartIcon />
              </UnavailableAction>
            </div>
          </div>
        </div>
      </div>
      {item.mediaType === "tv" && item.provider === "tmdb" && (
        <div className="mt-2">
          <TVSubscribeButton tmdbId={item.providerId} title={title.title} />
        </div>
      )}
    </article>
  )
}
