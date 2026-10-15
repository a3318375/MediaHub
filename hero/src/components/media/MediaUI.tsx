import { Button, Tabs } from "@heroui/react";

import { Clapperboard, Film, Heart, Plus, Search, Star } from "lucide-react";

import { useEffect, useState, type ReactNode } from "react";

import type { MediaSummary } from "../../lib/media-contract";

import { formatRegion, presentTitle } from "../../lib/media-presentation";

import { kindLabels } from "../../lib/formatters";
import { image, readSession } from "../../lib/media-service";
export type { API } from "../../lib/formatters";
export { dateCN, errorText, kindLabels, time } from "../../lib/formatters";

export function FilterTabs({
  label,
  value,
  options,
  onChange,
  disabled = false,
}: {
  label: string;
  value: string;
  options: string[][];
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="media-filter">
      <span>{label}</span>
      <Tabs
        aria-label={label}
        selectedKey={value}
        onSelectionChange={(k) => onChange(String(k))}
      >
        <Tabs.ListContainer>
          <Tabs.List aria-label={label}>
            {options.map(([id, text]) => (
              <Tabs.Tab key={id} id={id} isDisabled={disabled}>
                {text}
                <Tabs.Indicator />
              </Tabs.Tab>
            ))}
          </Tabs.List>
        </Tabs.ListContainer>
      </Tabs>
    </div>
  );
}

export function Empty({
  children,
  action,
}: {
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="media-empty">
      <Film size={30} />
      <p>{children}</p>
      {action}
    </div>
  );
}

export function Poster({
  media,
  index = 0,
  onOpen,
  onSearch,
  onSubscribe,
  rank,
  subscribed = false,
  badge,
  metadata,
  actions,
}: {
  media: MediaSummary;
  index?: number;
  onOpen: () => void;
  onSearch?: () => void;
  onSubscribe?: () => void;
  rank?: number;
  subscribed?: boolean;
  badge?: ReactNode;
  metadata?: ReactNode;
  actions?: ReactNode;
}) {
  const src = image(media.posterPath);
  const { title } = presentTitle(media);
  return (
    <article className="poster-card">
      <div className={`poster-art palette-${index % 6}`}>
        {src ? (
          <MediaImage src={src} alt={title} />
        ) : (
          <div className="poster-placeholder">
            <Clapperboard size={24} />
            <strong>{title}</strong>
          </div>
        )}
        <span className="poster-kind">
          {badge ?? (rank ? `#${rank}` : kindLabels[media.mediaType])}
        </span>
        {media.ratings[0]?.value !== undefined && (
          <span className="poster-rating">
            <Star size={11} fill="currentColor" />
            {media.ratings[0].value.toFixed(1)}
          </span>
        )}
        <button
          type="button"
          className="poster-open"
          aria-label={`查看 ${media.title}`}
          onClick={onOpen}
        />
        <div className="poster-overlay">
          <small>
            {metadata ??
              [
                media.year,
                kindLabels[media.mediaType],
                formatRegion(media.originCountries, media.region),
                {
                  tmdb: "TMDB",
                  douban: "豆瓣",
                  bangumi: "Bangumi",
                  anilist: "AniList",
                  emby: "Emby",
                }[media.provider],
              ]
                .filter(Boolean)
                .join(" · ")}
          </small>
          <h3>{title}</h3>
          {media.overview && <p>{media.overview}</p>}
          <div className="poster-quick-actions">
            {onSearch && (
              <Button
                isIconOnly
                size="sm"
                variant="ghost"
                aria-label={`搜索《${title}》资源`}
                onPress={onSearch}
              >
                <Search size={17} />
              </Button>
            )}
            {actions ?? (
              <span
                tabIndex={0}
                aria-label="收藏功能暂未接入"
                title="收藏功能暂未接入"
              >
                <Button
                  isIconOnly
                  size="sm"
                  variant="ghost"
                  isDisabled
                  aria-hidden="true"
                >
                  <Heart size={17} />
                </Button>
              </span>
            )}
          </div>
        </div>
      </div>
      {onSubscribe && media.mediaType === "tv" && media.provider === "tmdb" && (
        <Button
          className="poster-subscribe"
          size="sm"
          variant="secondary"
          isDisabled={subscribed}
          onPress={onSubscribe}
        >
          <Plus size={14} />
          {subscribed ? "已订阅" : "订阅此剧"}
        </Button>
      )}
    </article>
  );
}

export function MediaImage({
  src,
  alt,
  className,
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  const [object, setObject] = useState<{ source: string; url: string } | null>(
    null,
  );
  const [failed, setFailed] = useState("");
  const proxy = src.startsWith("/api/");
  useEffect(() => {
    if (!proxy) return;
    const c = new AbortController();
    let url = "";
    const token = readSession()?.token;
    fetch(src, {
      signal: c.signal,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((r) => {
        if (!r.ok) throw new Error("海报不可用");
        return r.blob();
      })
      .then((blob) => {
        if (!c.signal.aborted) {
          url = URL.createObjectURL(blob);
          setObject({ source: src, url });
        }
      })
      .catch(() => {
        if (!c.signal.aborted) setFailed(src);
      });
    return () => {
      c.abort();
      if (url) URL.revokeObjectURL(url);
    };
  }, [src, proxy]);
  const url = proxy ? (object?.source === src ? object.url : "") : src;
  return url && failed !== src ? (
    <img
      className={className}
      src={url}
      alt={alt}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(src)}
    />
  ) : (
    <div className="poster-placeholder" role="img" aria-label={alt}>
      <Clapperboard size={24} />
      <span>{alt}</span>
    </div>
  );
}

export function PosterGrid({
  items,
  open,
  search,
  subscribe,
  ranking = false,
  subscribed = [],
}: {
  items: MediaSummary[];
  open: (m: MediaSummary) => void;
  search?: (m: MediaSummary) => void;
  subscribe?: (m: MediaSummary) => void;
  ranking?: boolean;
  subscribed?: string[];
}) {
  return items.length ? (
    <div className="poster-grid">
      {items.map((m, i) => (
        <Poster
          key={`${m.mediaId}-${i}`}
          media={m}
          index={i}
          onOpen={() => open(m)}
          onSearch={
            search
              ? () => search({ ...m, title: presentTitle(m).title })
              : undefined
          }
          onSubscribe={subscribe ? () => subscribe(m) : undefined}
          rank={ranking ? i + 1 : undefined}
          subscribed={subscribed.includes(m.sourceId)}
        />
      ))}
    </div>
  ) : (
    <Empty>没有符合条件的作品，换个筛选试试。</Empty>
  );
}
