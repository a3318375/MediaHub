import { useEffect,useState } from "react";
import { AnimeCard } from "./AnimeCard";

import { Button } from "@heroui/react";

import { Plus,RefreshCw } from "lucide-react";

import { animeApi,type SavedAnimeSubscription } from "../../lib/anime-api";

import { read,save,type Session } from "../../lib/media-service";

import { Field,Notice } from "../../components/ui/ManagementUI";

import type { MediaSummary } from "../../lib/media-contract";

import {
Empty,
FilterTabs,
errorText
} from "../../components/media/MediaUI";
import { animeMedia } from "../../lib/anime-presentation";
import { AnimeDownloads } from "./AnimeDownloads";
import { AnimeEditor } from "./AnimeEditor";

export function AnimeSubscriptions({
  session,
  open,
}: {
  session: Session;
  open: (media: MediaSummary) => void;
}) {
  const [items, setItems] = useState<SavedAnimeSubscription[]>([]);
  const [add, setAdd] = useState(false);
  const [downloads, setDownloads] = useState<SavedAnimeSubscription | null>(
    null,
  );
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [weekday, setWeekday] = useState("all");
  const [busy, setBusy] = useState<Set<string>>(() => new Set());
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
    if (busy.has(item.id) || item.completed) return;
    setBusy(old => new Set(old).add(item.id));
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
      setItems(old => { const next = old.map(a => a.id === item.id ? result : a); if (session.mode === "demo") save("mediahub.hero.anime", next); return next; });
    } catch (e) {
      setError(errorText(e));
      if (refresh && session.mode === "live") { try { const saved = (await animeApi.list()).find(a => a.id === item.id); if (saved) setItems(old => old.map(a => a.id === saved.id ? saved : a)); } catch { /* Preserve previous successful data. */ } }
    } finally {
      setBusy(old => { const next = new Set(old); next.delete(item.id); return next; });
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
        <Empty action={<Button onPress={() => { setQuery(""); setWeekday("all"); setStatus("all"); }}>清除筛选</Button>}>
          暂无符合条件的动漫订阅
        </Empty>
      ) : (
        <div className="anime-subscription-grid">
          {visible.sort((a,b) => b.updatedAt.localeCompare(a.updatedAt)).map(a => <AnimeCard key={a.id} anime={a} busy={busy.has(a.id)} open={() => open(animeMedia(a))} action={refresh => void action(a, refresh)} downloads={() => setDownloads(a)}/>)}
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
