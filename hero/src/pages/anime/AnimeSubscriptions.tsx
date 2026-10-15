import { useEffect,useState } from "react";

import { Button } from "@heroui/react";

import { Download,Ellipsis,Plus,RefreshCw } from "lucide-react";

import { Overlay } from '../../components/ui/Overlay';

import {
animeApi,
type SavedAnimeSubscription
} from "../../lib/anime-api";


import { read,safeURL,save,type Session } from "../../lib/media-service";

import {
Field,
Notice
} from "../../components/ui/ManagementUI";

import type { MediaSummary } from "../../lib/media-contract";

import { Empty,FilterTabs,Poster,errorText,time } from "../../components/media/MediaUI";
import { animeMedia } from '../../lib/anime-presentation';
import { AnimeDownloads } from './AnimeDownloads';
import { AnimeEditor } from './AnimeEditor';

export function AnimeSubscriptions({
  session,
  search,
}: {
  session: Session;
  search: (media: MediaSummary) => void;
}) {
  const [items, setItems] = useState<SavedAnimeSubscription[]>([]);
  const [add, setAdd] = useState(false);
  const [detail, setDetail] = useState<SavedAnimeSubscription | null>(null);
  const [downloads, setDownloads] = useState<SavedAnimeSubscription | null>(
    null,
  );
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [weekday, setWeekday] = useState("all");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const c = new AbortController();
    setLoading(true);
    setError("");
    (session.mode === "demo"
      ? Promise.resolve(
          read<SavedAnimeSubscription[]>("mediahub.hero.anime", []),
        )
      : animeApi.list(c.signal)
    )
      .then((r) => {
        if (!c.signal.aborted) setItems(r);
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(errorText(e));
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false);
      });
    return () => c.abort();
  }, [session, revision]);
  function update(next: SavedAnimeSubscription[]) {
    setItems(next);
    if (session.mode === "demo") save("mediahub.hero.anime", next);
  }
  async function action(item: SavedAnimeSubscription, refresh: boolean) {
    if (busy) return;
    setBusy(item.id);
    setError("");
    try {
      const result =
        session.mode === "demo"
          ? {
              ...item,
              ...(refresh
                ? { lastCheckedAt: new Date().toISOString() }
                : { enabled: !item.enabled }),
            }
          : refresh
            ? await animeApi.refresh(item.id)
            : await animeApi.enable(item.id, !item.enabled);
      update(items.map((a) => (a.id === item.id ? result : a)));
      setDetail((current) => (current?.id === result.id ? result : current));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy("");
    }
  }
  const visible = items.filter(
    (i) =>
      (weekday === "all" || String(i.week) === weekday) &&
      (!query ||
        `${i.title} ${i.originalTitle}`
          .toLowerCase()
          .includes(query.toLowerCase())) &&
      (status === "all" ||
        (status === "completed"
          ? i.completed
          : status === "enabled"
            ? i.enabled && !i.completed
            : !i.enabled)),
  );
  return (
    <section className="management-stack">
      <div className="media-section-heading">
        <h2>
          动漫订阅 <small>{items.length} 部</small>
        </h2>
        <div className="management-actions">
          <Button
            variant="secondary"
            isDisabled={loading}
            onPress={() => setRevision((n) => n + 1)}
          >
            <RefreshCw size={16} />
            刷新
          </Button>
          <Button onPress={() => setAdd(true)}>
            <Plus size={16} />
            添加动漫
          </Button>
        </div>
      </div>
      <Field label="搜索订阅" value={query} onChange={setQuery} />
      <FilterTabs
        label="更新日"
        value={weekday}
        options={[
          ["all", "全部"],
          ...[1, 2, 3, 4, 5, 6, 7].map((n) => [
            String(n),
            `周${"一二三四五六日"[n - 1]} · ${items.filter((i) => i.week === n).length}`,
          ]),
        ]}
        onChange={setWeekday}
      />
      <FilterTabs
        label="状态"
        value={status}
        options={[
          ["all", "全部"],
          ["enabled", "更新中"],
          ["paused", "已暂停"],
          ["completed", "已完结"],
        ]}
        onChange={setStatus}
      />
      <Notice error={error} />
      {loading ? (
        <Empty>正在读取动漫订阅…</Empty>
      ) : !visible.length ? (
        <Empty action={<Button onPress={() => setAdd(true)}>添加订阅</Button>}>
          暂无符合条件的动漫订阅
        </Empty>
      ) : (
        <div className="poster-grid">
          {visible.map((a, index) => (
            <Poster
              key={a.id}
              index={index}
              media={animeMedia(a)}
              onOpen={() => setDetail(a)}
              onSearch={() => search(animeMedia(a))}
              badge={a.completed ? "已完结" : a.enabled ? "更新中" : "已暂停"}
              metadata={`第 ${a.season} 季 · ${a.latestEpisode || 0} / ${a.totalEpisodes || "?"} 集 · ${a.week ? `周${"一二三四五六日"[a.week - 1]}` : "更新日未知"}`}
              actions={
                <Button
                  isIconOnly
                  size="sm"
                  variant="ghost"
                  aria-label={`管理《${a.title}》订阅`}
                  onPress={() => setDetail(a)}
                >
                  <Ellipsis size={18} />
                </Button>
              }
            />
          ))}
        </div>
      )}
      {add && (
        <AnimeEditor
          session={session}
          close={() => setAdd(false)}
          created={(a) => {
            update([a, ...items.filter((i) => i.id !== a.id)]);
            setAdd(false);
          }}
        />
      )}
      {detail && (
        <Overlay title={detail.title} onClose={() => setDetail(null)}>
          <div className="management-stack">
            <p>{detail.description || "暂无简介"}</p>
            <p>
              {detail.completed
                ? "已完结"
                : detail.enabled
                  ? "更新中"
                  : "已暂停"}{" "}
              · 第 {detail.season} 季 · {detail.latestEpisode || 0} /{" "}
              {detail.totalEpisodes || "?"} 集
            </p>
            <small>最近检查：{time(detail.lastCheckedAt)}</small>
            <Notice error={detail.lastError || detail.metadataError} />
            <div className="management-actions">
              <Button
                size="sm"
                variant="secondary"
                isDisabled={!!busy}
                onPress={() => void action(detail, false)}
              >
                {detail.enabled ? "暂停" : "恢复"}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                isDisabled={!!busy}
                onPress={() => void action(detail, true)}
              >
                检查更新
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onPress={() => {
                  setDownloads(detail);
                  setDetail(null);
                }}
              >
                <Download size={14} />
                自动下载
              </Button>
            </div>
            <p>
              Bangumi {detail.bangumiId || "—"} · 评分 {detail.rating || "—"}
            </p>
            <p>主 RSS：{detail.url}</p>
            {detail.standby.map((f, i) => (
              <p key={i}>
                备用：{f.label} · 偏移 {f.offset} · {f.url}
              </p>
            ))}
            {detail.resources.length ? (
              detail.resources.map((r, i) => (
                <div className="management-row" key={`${r.url}-${i}`}>
                  <div>
                    <a href={safeURL(r.url)} target="_blank" rel="noreferrer">
                      {r.title}
                    </a>
                    <small>
                      {r.episode ? `第 ${r.episode} 集 · ` : ""}
                      {time(r.publishedAt)} ·{" "}
                      {r.accepted ? "匹配" : r.reason || "未匹配"}
                    </small>
                  </div>
                </div>
              ))
            ) : (
              <Empty>尚未发现资源，检查更新后再查看。</Empty>
            )}
          </div>
        </Overlay>
      )}
      {downloads && (
        <AnimeDownloads
          anime={downloads}
          session={session}
          close={() => setDownloads(null)}
        />
      )}
    </section>
  );
}
