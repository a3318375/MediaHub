import { useEffect, useState } from "react";
import { formatRegion, presentTitle } from "../../lib/media-presentation";

import { Button, Card, Chip } from "@heroui/react";

import { ChevronLeft, Film, Plus, Search } from "lucide-react";

import { image } from "../../lib/media-service";

import { SelectField } from "../../components/ui/ManagementUI";

import type { MediaDetail, MediaSummary } from "../../lib/media-contract";

import {
  errorText,
  kindLabels,
  MediaImage,
  type API,
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
    setData(media);
    setBusy(true);
    setError("");
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
  const { title, subtitle } = presentTitle(data);
  const region = formatRegion(data.originCountries, data.region);
  return (
    <section className="detail-page" aria-label={`${data.title}的作品详情`}>
      <Button variant="ghost" onPress={close}>
        <ChevronLeft size={16} />
        返回列表
      </Button>
      <section className="detail-hero">
        {image(data.backdropPath || data.posterPath) && (
          <MediaImage
            className="detail-backdrop"
            src={image(data.backdropPath || data.posterPath)!}
            alt=""
          />
        )}
        <h1>
          {title}
          {data.year && <small> ({data.year})</small>}
        </h1>
        <div className="media-detail">
          <div className="media-detail-poster">
            {image(data.posterPath) ? (
              <MediaImage src={image(data.posterPath)!} alt={data.title} />
            ) : (
              <div className="poster-placeholder">{data.title}</div>
            )}
          </div>
          <div>
            <p>{subtitle}</p>
            <p>
              {data.year} · {data.genres.join(" / ")}
            </p>
            <p className="media-note">
              {data.status}{" "}
              {data.runtimeMinutes ? `· ${data.runtimeMinutes} 分钟` : ""}{" "}
              {region}
            </p>
            {data.tagline && <p>{data.tagline}</p>}
            {data.provider === "anilist" && !!data.titles?.synonyms?.length && (
              <p>别名：{data.titles.synonyms.slice(0, 5).join("、")}</p>
            )}
            {data.externalIds?.imdb &&
              /^tt\d+$/.test(data.externalIds.imdb) && (
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
        <div className="management-actions">
          <Button variant="secondary" onPress={() => search(title)}>
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
      </section>
      <div className="detail-columns">
        <Card className="detail-profile">
          <h2>作品资料</h2>
          <dl>
            {[
              ["类型", kindLabels[data.mediaType]],
              ["原名", subtitle],
              ["发布时间", data.releaseDate],
              ["年份", data.year],
              ["地区", region],
              ["来源", data.provider],
              ["状态", data.status],
            ].map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value || "—"}</dd>
              </div>
            ))}
          </dl>
          {data.externalIds?.imdb && (
            <a
              href={`https://www.imdb.com/title/${encodeURIComponent(data.externalIds.imdb)}/`}
              target="_blank"
              rel="noreferrer"
            >
              IMDb · {data.externalIds.imdb}
            </a>
          )}
          <div className="management-actions">
            {(data.genres.length ? data.genres : ["暂无标签"]).map((g) => (
              <Chip key={g} size="sm">
                {g}
              </Chip>
            ))}
          </div>
        </Card>
        <div className="detail-content">
          {(!!data.credits?.length || busy || error) && (
            <section className="detail-credits">
              <h2>演职员</h2>
              {!data.credits?.length && (
                <p role="status">
                  {busy ? "正在加载演职员信息…" : "暂无演职员信息。"}
                </p>
              )}
              <div>
                {data.credits?.map((credit, index) => (
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
          {!!data.seasons?.length && (
            <Card className="detail-seasons">
              <h2>季与集</h2>
              {data.seasons.map((s) => (
                <div key={s.seasonNumber}>
                  <strong>{s.name || `第 ${s.seasonNumber} 季`}</strong>
                  <p>
                    {s.episodeCount ? `${s.episodeCount} 集` : "集数信息待补充"}
                  </p>
                </div>
              ))}
            </Card>
          )}
        </div>
      </div>
    </section>
  );
}
