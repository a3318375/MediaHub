import { useEffect,useState } from "react";

import { Button,Chip } from "@heroui/react";

import {
ChevronLeft,
Film,
Plus,
Search
} from "lucide-react";

import { image } from "../../lib/media-service";



import { SelectField } from "../../components/ui/ManagementUI";

import type {
MediaDetail,
MediaSummary
} from "../../lib/media-contract";

import {
errorText,
MediaImage,
type API
} from "../../components/media/MediaUI";


export function Detail({
  media,
  api,
  close,
  search,
  subscribe,
}: {
  media: MediaSummary;
  api: API;
  close: () => void;
  search: (q: string) => void;
  subscribe: (m: MediaSummary, season: number) => void;
}) {
  const [data, setData] = useState<MediaDetail>(media);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [season, setSeason] = useState("1");
  useEffect(() => {
    let active = true;
    api
      .detail(media)
      .then((v) => {
        if (active) {
          setData(v);
          setSeason(
            String(
              v.seasons?.find((s) => s.seasonNumber > 0)?.seasonNumber || 1,
            ),
          );
        }
      })
      .catch((e) => {
        if (active) setError(errorText(e));
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [api, media]);
  return (
    <section className="detail-page" aria-label={`${data.title}的作品详情`}>
      <Button variant="ghost" onPress={close}>
        <ChevronLeft size={16} />
        返回列表
      </Button>
      <h1>{data.title}</h1>
      <div className="management-actions">
        <Button variant="secondary" onPress={() => search(data.title)}>
          <Search size={15} />
          搜索资源
        </Button>
        {(data.source === "tmdb" || data.externalIds?.tmdb) &&
          data.mediaType === "tv" && (
            <Button
              onPress={() =>
                subscribe(
                  {
                    ...data,
                    source: "tmdb",
                    provider: "tmdb",
                    sourceId: data.externalIds?.tmdb || data.sourceId,
                    providerId: data.externalIds?.tmdb || data.providerId,
                  },
                  Number(season),
                )
              }
            >
              <Plus size={15} />
              订阅此剧
            </Button>
          )}
      </div>
      <div className="media-detail">
        <div className="media-detail-poster">
          {image(data.posterPath) ? (
            <MediaImage src={image(data.posterPath)!} alt={data.title} />
          ) : (
            <div className="poster-placeholder">{data.title}</div>
          )}
        </div>
        <div>
          <p>{data.originalTitle}</p>
          <p>
            {data.year} · {data.genres.join(" / ")}
          </p>
          <p className="media-note">
            {data.status}{" "}
            {data.runtimeMinutes ? `· ${data.runtimeMinutes} 分钟` : ""}{" "}
            {data.originCountries?.join(" / ") || data.region || ""}
          </p>
          {data.tagline && <p>{data.tagline}</p>}
          {data.externalIds?.imdb && /^tt\d+$/.test(data.externalIds.imdb) && (
            <a
              href={`https://www.imdb.com/title/${data.externalIds.imdb}/`}
              target="_blank"
              rel="noreferrer"
            >
              查看 IMDb 条目
            </a>
          )}
          <div className="media-ratings">
            {data.ratings.map((r) => (
              <Chip key={r.source} variant="soft">
                {r.source.toUpperCase()} · {r.value}
              </Chip>
            ))}
          </div>
          <p>{busy ? "正在加载详情…" : data.overview || "暂无简介"}</p>
          {data.credits?.length ? (
            <p className="media-note">
              演职员：
              {data.credits
                .slice(0, 8)
                .map((c) => `${c.name}（${c.role}）`)
                .join("、")}
            </p>
          ) : null}
          {data.seasons?.length ? (
            <SelectField
              label="订阅季"
              value={season}
              options={data.seasons
                .filter((s) => s.seasonNumber > 0)
                .map((s) => [
                  String(s.seasonNumber),
                  `${s.name || `第 ${s.seasonNumber} 季`}${s.episodeCount ? ` · ${s.episodeCount} 集` : ""}`,
                ])}
              onChange={setSeason}
            />
          ) : null}
          {error && (
            <p role="alert" className="media-error">
              {error}
            </p>
          )}
        </div>
      </div>
      {!!data.credits?.length && (
        <section className="detail-credits">
          <h2>演职员</h2>
          <div>
            {data.credits.slice(0, 24).map((credit, index) => (
              <article key={`${credit.name}-${index}`}>
                {credit.profilePath ? (
                  <MediaImage
                    src={image(credit.profilePath)!}
                    alt={credit.name}
                  />
                ) : (
                  <div className="credit-placeholder">
                    <Film size={24} />
                  </div>
                )}
                <strong>{credit.name}</strong>
                <small>{credit.role}</small>
              </article>
            ))}
          </div>
        </section>
      )}
    </section>
  );
}
