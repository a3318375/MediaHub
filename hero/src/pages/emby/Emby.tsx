import { Button, Card } from "@heroui/react";
import { Film, Tv, Clapperboard, Play, Users, Clock, RefreshCw, Check } from "lucide-react";
import { useEffect, useState } from "react";
import {
  Empty,
  FilterTabs,
  errorText,
  time,
} from "../../components/media/MediaUI";
import { Notice } from "../../components/ui/ManagementUI";
import type { MediaSummary } from "../../lib/media-contract";
import { request, type Session } from "../../lib/media-service";
type Item = {
  id: string;
  title: string;
  kind: string;
  year: number;
  rating: string;
  libraryId: string;
  siteId: string;
  summary: string;
  progress?: number;
  resumeLabel?: string;
  remaining?: string;
};
type Dashboard = {
  updatedAt: string;
  warnings: string[];
  sites: { id: string; label: string }[];
  stats: Record<string, Record<string, number>>;
  libraries: {
    id: string;
    title: string;
    type: string;
    count: number;
    siteId: string;
  }[];
  recentlyAdded: Item[];
  continueWatching: Item[];
};
function EmbyArtwork({
  id,
  title,
  session,
}: {
  id: string;
  title: string;
  session: Session;
}) {
  const [url, setURL] = useState("");
  useEffect(() => {
    const c = new AbortController();
    let objectURL = "";
    setURL("");
    fetch(`/api/emby/items/${encodeURIComponent(id)}/image`, {
      signal: c.signal,
      headers: { Authorization: `Bearer ${session.token}` },
    })
      .then((r) => {
        if (!r.ok) throw new Error("图片不可用");
        return r.blob();
      })
      .then((blob) => {
        if (!c.signal.aborted) {
          objectURL = URL.createObjectURL(blob);
          setURL(objectURL);
        }
      })
      .catch(() => {});
    return () => {
      c.abort();
      if (objectURL) URL.revokeObjectURL(objectURL);
    };
  }, [id, session]);
  return url ? (
    <img src={url} alt={`${title}海报`} loading="lazy" />
  ) : (
    <div className="poster-placeholder">
      <Film size={28} />
      <strong>{title}</strong>
    </div>
  );
}
export function Emby({
  session,
  open,
}: {
  session: Session;
  open: (m: MediaSummary) => void;
}) {
  const [data, setData] = useState<Dashboard | null>(null);
  const [site, setSite] = useState("all");
  const [library, setLibrary] = useState("");
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setBusy(true);
    setError("");
    if (session.mode === "demo") {
      setBusy(false);
      return;
    }
    request<Dashboard>(
      `/api/emby/dashboard${revision ? "?refresh=true" : ""}`,
      session,
    )
      .then((r) => {
        if (active) setData(r);
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
  }, [session, revision]);
  const visible = (list: Item[]) =>
    list.filter(
      (i) =>
        (site === "all" || i.siteId === site) &&
        (!library || i.libraryId === library),
    );
  function media(item: Item): MediaSummary {
    return {
      mediaId: item.id,
      source: "emby",
      sourceId: item.id,
      provider: "emby",
      providerId: item.id,
      title: item.title,
      mediaType:
        item.kind === "电影"
          ? "movie"
          : item.kind === "动画"
            ? "anime"
            : item.kind === "纪录片"
              ? "documentary"
              : "tv",
      year: item.year,
      ratings: [],
      genres: [],
      overview: item.summary,
    };
  }
  return (
    <section className="management-stack emby-dashboard">
      <div className="emby-toolbar">
        <div className="emby-overview"><h2>媒体概览</h2>{data && <span>更新于 {time(data.updatedAt)}</span>}</div>
        <Button
          variant="secondary"
          size="sm"
          isDisabled={busy || session.mode === "demo"}
          onPress={() => setRevision((n) => n + 1)}
        >
          <RefreshCw size={14} className={busy ? "emby-syncing" : undefined} />
          {busy ? "读取中…" : "同步媒体库"}
        </Button>
      </div>
      <Notice error={error} />
      {session.mode === "demo" ? (
        <Empty>
          连接服务并在设置中配置 Emby 后，可查看媒体库、最新入库与继续观看。
        </Empty>
      ) : data ? (
        <>
          {data.warnings.map((w, i) => (
            <Notice key={i} error={w} />
          ))}
          <FilterTabs
            label="站点"
            value={site}
            options={data.sites.map((s) => [s.id, s.label])}
            onChange={(v) => {
              setSite(v);
              setLibrary("");
            }}
          />
          <div className="media-stat-grid">
            {([
              ["movies", "电影", Film],
              ["series", "剧集", Tv],
              ["episodes", "总集数", Clapperboard],
              ["plays", "播放次数", Play],
              ["viewers", "活跃观众", Users],
              ["hours", "观看时长（小时）", Clock],
            ] as const).map(([key, label, Icon]) => (
              <Card key={key} className="media-stat">
                <div className="emby-stat-label"><span>{label}</span><Icon size={16} aria-hidden="true" /></div>
                <strong>{data.stats[site]?.[key]?.toLocaleString() ?? "—"}</strong>
              </Card>
            ))}
          </div>
          <div className="media-section-heading">
            <h2>媒体库分类</h2>
            {library && (
              <Button variant="ghost" onPress={() => setLibrary("")}>
                显示全部
              </Button>
            )}
          </div>
          <div className="emby-library-grid">
            {data.libraries
              .filter((l) => site === "all" || l.siteId === site)
              .map((l) => (
                <button
                  type="button"
                  key={l.id}
                  className="emby-library-card"
                  aria-pressed={library === l.id}
                  onClick={() => setLibrary(library === l.id ? "" : l.id)}
                >
                  <div className="emby-library-cover"><EmbyArtwork id={l.id} title={l.title} session={session} />{library === l.id && <span className="emby-library-selected"><Check size={14} /></span>}</div>
                  <div className="emby-library-caption"><strong>{l.title}</strong><span>{l.count.toLocaleString()} 部作品</span></div>
                </button>
              ))}
          </div>
          <div className="emby-activity-grid">
          {[
            ["最近入库", visible(data.recentlyAdded)],
            ["继续播放", visible(data.continueWatching)],
          ].map(([title, items]) => (
            <section className="management-stack emby-activity-section" key={String(title)}>
              <h2>{String(title)}</h2>
              {(items as Item[]).length ? (
                <div className="poster-grid">
                  {(items as Item[]).slice(0, 10).map((i) => (
                    <button
                      key={i.id}
                      className="poster-card"
                      onClick={() => open(media(i))}
                    >
                      <div className="poster-art">
                        <EmbyArtwork
                          id={i.id}
                          title={i.title}
                          session={session}
                        />
                      </div>
                      <strong className="poster-title">{i.title}</strong>
                      <span className="poster-meta">
                        {i.year} · {i.kind} · {i.rating || "暂无评分"}
                      </span>
                      {i.progress !== undefined && (
                        <>
                          <progress
                            aria-label={`${i.title}观看进度`}
                            value={i.progress}
                            max={100}
                          />
                          <small>
                            {i.resumeLabel} · {i.remaining}
                          </small>
                        </>
                      )}
                    </button>
                  ))}
                </div>
              ) : (
                <Empty>此分类暂无作品</Empty>
              )}
            </section>
          ))}
          </div>
        </>
      ) : !busy && !error ? (
        <Empty>Emby 尚未配置</Empty>
      ) : busy ? (
        <Empty>正在读取媒体库…</Empty>
      ) : null}
    </section>
  );
}
