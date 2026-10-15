import { useState, type ReactNode } from "react";
import { Tabs } from "@heroui/react";
import { Clapperboard, Film, Star } from "lucide-react";
import { image, type service } from "./media-service";
import type { MediaSummary } from "./media-contract";
export type API = ReturnType<typeof service>;
export const kindLabels: Record<string, string> = {
  movie: "电影",
  tv: "剧集",
  anime: "动画",
  documentary: "纪录片",
};
export function errorText(e: unknown) {
  return e instanceof Error ? e.message : "请求失败，请重试";
}
export function dateCN(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}
export function time(value: string) {
  return value
    ? new Date(value).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })
    : "尚未检查";
}
export function FilterTabs({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[][];
  onChange: (v: string) => void;
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
              <Tabs.Tab key={id} id={id}>
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
}: {
  media: MediaSummary;
  index?: number;
  onOpen: () => void;
}) {
  const [failed, setFailed] = useState(false);
  const src = image(media.posterPath);
  return (
    <button
      className="poster-card"
      onClick={onOpen}
      aria-label={`查看 ${media.title}`}
    >
      <div className={`poster-art palette-${index % 6}`}>
        {src && !failed ? (
          <img
            src={src}
            alt={media.title}
            loading="lazy"
            onError={() => setFailed(true)}
          />
        ) : (
          <div className="poster-placeholder">
            <Clapperboard size={24} />
            <span>{media.originalTitle || media.title}</span>
            <strong>{media.title}</strong>
            <small>
              {media.year} / {kindLabels[media.mediaType]}
            </small>
          </div>
        )}
        <span className="poster-rating">
          <Star size={11} fill="currentColor" />{" "}
          {media.ratings[0]?.value?.toFixed(1) || "暂无"}
        </span>
      </div>
      <strong className="poster-title">{media.title}</strong>
      <span className="poster-meta">
        {media.year || "年份未知"} ·{" "}
        {media.genres.slice(0, 2).join(" / ") || kindLabels[media.mediaType]}
      </span>
    </button>
  );
}
export function PosterGrid({
  items,
  open,
}: {
  items: MediaSummary[];
  open: (m: MediaSummary) => void;
}) {
  return items.length ? (
    <div className="poster-grid">
      {items.map((m, i) => (
        <Poster
          key={`${m.mediaId}-${i}`}
          media={m}
          index={i}
          onOpen={() => open(m)}
        />
      ))}
    </div>
  ) : (
    <Empty>没有符合条件的作品，换个筛选试试。</Empty>
  );
}
