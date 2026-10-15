import { Button,Card,Chip,Input } from "@heroui/react";
import {
Copy,
Download as DownloadIcon,
RefreshCw,
Search,
} from "lucide-react";
import { useEffect,useRef,useState } from "react";
import { Empty,errorText,FilterTabs,type API } from "../../components/media/MediaUI";
import { is115ShareURL,mediaContextFromRecord } from "../../lib/download-api";
import type { MediaSummary } from "../../lib/media-contract";
import {
request,
safeURL,
type Download,
type Resource,
type Resources,
type Session,
} from "../../lib/media-service";
import { cloudLabels } from "../../lib/parity";
import {
readResourceSearchHistory,
RESOURCE_SEARCH_CONFIG_CHANGED,
RESOURCE_SEARCH_HISTORY_KEY,
saveResourceSearchHistory,
type ResourceSearchMeta,
} from "../../lib/resource-search";
import { DownloadDialog } from "../downloads/Downloads";
export function ResourceSearch({
  api,
  session,
  initialQuery,
  notify,
  onDownloaded,
  media,
  back,
}: {
  api: API;
  session: Session;
  initialQuery: string;
  notify: (s: string) => void;
  onDownloaded: (d: Download) => void;
  media?: MediaSummary | null;
  back?: () => void;
}) {
  const [savedResult] = useState<{
    query: string;
    result: Resources;
    cloud: string;
    media?: MediaSummary;
  } | null>(() => {
    if (initialQuery) return null;
    try {
      const saved = JSON.parse(
        sessionStorage.getItem("mediahub.hero.resource-result") || "null",
      );
      return typeof saved?.query === "string" &&
        typeof saved.result?.total === "number" &&
        saved.result?.linksByCloud &&
        typeof saved.cloud === "string"
        ? saved
        : null;
    } catch {
      return null;
    }
  });
  const [query, setQuery] = useState(initialQuery || savedResult?.query || "");
  const [submitted, setSubmitted] = useState(savedResult?.query || "");
  const [result, setResult] = useState<Resources | null>(
    savedResult?.result || null,
  );
  const [cloud, setCloud] = useState(savedResult?.cloud || "all");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState(() =>
    readResourceSearchHistory(localStorage).map((entry) => entry.keyword),
  );
  const [preferences, setPreferences] = useState<
    ResourceSearchMeta["selection"] | null
  >(null);
  const [autoDetect, setAutoDetect] = useState(false);
  const autoSeen = useRef(new Set<string>());
  const [updating, setUpdating] = useState(false);
  const [health, setHealth] = useState<
    Record<string, { state: string; summary?: string }>
  >({});
  const [checking, setChecking] = useState("");
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const [download, setDownload] = useState<Resource | null>(null);
  const searchRun = useRef(0);
  useEffect(
    () => () => {
      searchRun.current++;
      timers.current.forEach(clearTimeout);
    },
    [],
  );
  async function search(value = query, force = false) {
    if (!value.trim()) return;
    const run = ++searchRun.current;
    timers.current.forEach(clearTimeout);
    setUpdating(false);
    setHealth({});
    autoSeen.current.clear();
    setBusy(true);
    setError("");
    setSubmitted(value.trim());
    setResult(null);
    try {
      const r = await api.search(value.trim(), force);
      if (run !== searchRun.current) return;
      setResult(r);
      setCloud(Object.keys(r.linksByCloud)[0] || "all");
      setHistory(
        saveResourceSearchHistory(localStorage, {
          keyword: value.trim(),
          source: "all",
          mode: "default",
          cloudTypes: preferences?.cloudTypes || [],
          plugins: preferences?.plugins || [],
          channels: preferences?.channels || [],
          at: Date.now(),
        }).map((entry) => entry.keyword),
      );
      if (session.mode === "live") {
        setUpdating(true);
        for (const delay of [2000, 5000, 8000]) {
          timers.current.push(
            setTimeout(async () => {
              try {
                const incoming = await api.search(value.trim(), false, true);
                if (run !== searchRun.current) return;
                setResult((current) => {
                  if (!current) return incoming;
                  const merged: Record<string, Resource[]> = {
                    ...current.linksByCloud,
                  };
                  for (const [cloud, links] of Object.entries(
                    incoming.linksByCloud || {},
                  )) {
                    merged[cloud] = [
                      ...new Map(
                        [...(merged[cloud] || []), ...links].map((l) => [
                          l.url,
                          l,
                        ]),
                      ).values(),
                    ];
                  }
                  return {
                    ...incoming,
                    items: [...current.items, ...incoming.items],
                    linksByCloud: merged,
                    total: Object.values(merged).reduce(
                      (n, l) => n + l.length,
                      0,
                    ),
                  };
                });
              } catch (e) {
                if (run === searchRun.current)
                  notify(`收集插件结果失败：${errorText(e)}`);
              } finally {
                if (delay === 8000 && run === searchRun.current)
                  setUpdating(false);
              }
            }, delay),
          );
        }
      }
    } catch (e) {
      if (run === searchRun.current) setError(errorText(e));
    } finally {
      if (run === searchRun.current) setBusy(false);
    }
  }
  useEffect(() => {
    if (!result) return;
    try {
      sessionStorage.setItem(
        "mediahub.hero.resource-result",
        JSON.stringify({
          query: submitted,
          result,
          cloud,
          media: media || savedResult?.media,
        }),
      );
    } catch {
      /* Keep the in-memory result when storage is unavailable. */
    }
  }, [submitted, result, cloud, media, savedResult]);
  useEffect(() => {
    if (initialQuery) void search(initialQuery);
  }, []);
  const links = Object.entries(result?.linksByCloud || {})
    .filter(([key]) => cloud === "all" || cloud === key)
    .flatMap(([key, values]) =>
      values.map((r) => ({ ...r, cloud: r.cloud || key })),
    );
  useEffect(() => {
    if (session.mode !== "live") return;
    let active = true;
    const load = () =>
      request<{ data: ResourceSearchMeta }>("/api/v1/resources/meta", session)
        .then((r) => {
          if (active) {
            setAutoDetect(r.data.selection.detectionEnabled);
            setPreferences(r.data.selection);
          }
        })
        .catch(() => {});
    void load();
    window.addEventListener(RESOURCE_SEARCH_CONFIG_CHANGED, load);
    return () => {
      active = false;
      window.removeEventListener(RESOURCE_SEARCH_CONFIG_CHANGED, load);
    };
  }, [session]);
  const linkData = JSON.stringify(links);
  useEffect(() => {
    if (!autoDetect || !window.IntersectionObserver) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const pending = new Map<string, Resource>();
    const inFlight = new Set<string>();
    const current = JSON.parse(linkData) as Resource[];
    async function flush() {
      const batch = [...pending.values()].slice(0, 10);
      batch.forEach((r) => {
        pending.delete(r.url);
        inFlight.add(r.url);
      });
      try {
        const r = await request<{
          results: { url: string; state: string; summary?: string }[];
        }>("/api/v1/resources/check", session, "POST", {
          items: batch.map((l) => ({
            disk_type: l.cloud,
            url: l.url,
            password: l.password,
          })),
        });
        if (active)
          setHealth((old) => ({
            ...old,
            ...Object.fromEntries(r.results.map((i) => [i.url, i])),
          }));
      } catch {
        if (active)
          setHealth((old) => ({
            ...old,
            ...Object.fromEntries(
              batch.map((l) => [
                l.url,
                { state: "uncertain", summary: "检测失败，可手动重试" },
              ]),
            ),
          }));
      } finally {
        batch.forEach((r) => inFlight.delete(r.url));
        if (active && pending.size) timer = setTimeout(flush, 150);
      }
    }
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const link =
          current[Number((entry.target as HTMLElement).dataset.resourceIndex)];
        if (!link || autoSeen.current.has(link.url)) continue;
        autoSeen.current.add(link.url);
        pending.set(link.url, link);
        observer.unobserve(entry.target);
      }
      if (pending.size) {
        clearTimeout(timer);
        timer = setTimeout(flush, 150);
      }
    });
    document
      .querySelectorAll("[data-resource-index]")
      .forEach((el) => observer.observe(el));
    return () => {
      active = false;
      observer.disconnect();
      clearTimeout(timer);
      [...pending.keys(), ...inFlight].forEach((url) =>
        autoSeen.current.delete(url),
      );
    };
  }, [autoDetect, linkData, session]);
  async function copy(link: Resource) {
    try {
      await navigator.clipboard.writeText(
        `${link.url}${link.password ? ` 提取码：${link.password}` : ""}`,
      );
      notify("链接已复制");
    } catch {
      notify("复制失败，请手动选择链接复制");
    }
  }
  async function check(link: Resource) {
    setChecking(link.url);
    try {
      const r = await request<{
        results: { url: string; state: string; summary?: string }[];
      }>("/api/v1/resources/check", session, "POST", {
        items: [
          { disk_type: link.cloud, url: link.url, password: link.password },
        ],
      });
      const result = r.results.find((i) => i.url === link.url);
      if (result) setHealth((old) => ({ ...old, [link.url]: result }));
    } catch (e) {
      notify(errorText(e));
    } finally {
      setChecking("");
    }
  }
  return (
    <>
      {back && (
        <Button variant="ghost" onPress={back}>
          返回影视探索
        </Button>
      )}
      <Card className="resource-search-card">
        <div className="resource-search-icon">
          <Search size={24} />
        </div>
        <h2>想看什么，搜一下。</h2>
        <p>聚合 TG 频道与 PanSou 搜索结果</p>
        <form
          className="media-query"
          onSubmit={(e) => {
            e.preventDefault();
            void search();
          }}
        >
          <Input
            aria-label="资源关键词"
            placeholder="输入电影、剧集或资源关键词"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <Button type="submit" isDisabled={busy}>
            <Search size={16} />
            {busy ? "搜索中…" : "搜索资源"}
          </Button>
        </form>
        {history.length > 0 && (
          <div className="search-history">
            <span>最近搜索</span>
            {history.map((q) => (
              <button
                key={q}
                onClick={() => {
                  setQuery(q);
                  void search(q);
                }}
              >
                {q}
              </button>
            ))}
            <button
              onClick={() => {
                setHistory([]);
                try {
                  const entries = JSON.parse(
                    localStorage.getItem(RESOURCE_SEARCH_HISTORY_KEY) || "[]",
                  );
                  localStorage.setItem(
                    RESOURCE_SEARCH_HISTORY_KEY,
                    JSON.stringify(
                      entries.filter(
                        (entry: { kind?: string }) => entry.kind === "media",
                      ),
                    ),
                  );
                } catch {
                  /* Storage unavailable. */
                }
              }}
            >
              清空
            </button>
          </div>
        )}
      </Card>
      {error && (
        <p role="alert" className="media-error">
          {error}
        </p>
      )}
      {updating && (
        <p role="status" className="media-note">
          正在收集插件结果…
        </p>
      )}
      {result && (
        <>
          <div className="media-section-heading">
            <h2>
              “{submitted}” 的搜索结果<small>{result.total} 条链接</small>
            </h2>
            <Button
              size="sm"
              variant="secondary"
              isDisabled={busy}
              onPress={() => search(submitted, true)}
            >
              <RefreshCw size={14} />
              重新搜索
            </Button>
          </div>
          <FilterTabs
            label="网盘"
            value={cloud}
            options={[
              ...Object.keys(result.linksByCloud).map((k) => [
                k,
                `${cloudLabels[k] || k} (${result.linksByCloud[k].length})`,
              ]),
            ]}
            onChange={setCloud}
          />
          <div className="resource-grid">
            {links.map((r, i) => (
              <Card
                className="resource-card"
                data-resource-index={i}
                key={`${r.url}-${i}`}
              >
                <div>
                  <Chip size="sm" variant="soft">
                    {cloudLabels[r.cloud] || r.cloud}
                  </Chip>
                  <small>{r.source || "聚合搜索"}</small>
                </div>
                <h3>
                  {r.note ||
                    result.items.find((item) =>
                      item.links?.some((l) => l.url === r.url),
                    )?.title ||
                    submitted}
                </h3>
                <a href={safeURL(r.url)} target="_blank" rel="noreferrer">
                  {r.url}
                </a>
                {r.password && (
                  <p>
                    提取码：{r.password}{" "}
                    <Button
                      size="sm"
                      variant="ghost"
                      onPress={async () => {
                        try {
                          await navigator.clipboard.writeText(r.password!);
                          notify("提取码已复制");
                        } catch {
                          notify("复制失败，请手动复制提取码");
                        }
                      }}
                    >
                      复制提取码
                    </Button>
                  </p>
                )}
                {health[r.url] && (
                  <p className="media-note">
                    链接检测：
                    {(
                      {
                        ok: "有效",
                        bad: "失效",
                        locked: "需要提取码",
                        unsupported: "暂不支持",
                        uncertain: "待确认",
                      } as Record<string, string>
                    )[health[r.url].state] || health[r.url].state}{" "}
                    · {health[r.url].summary}
                  </p>
                )}
                <div className="resource-actions">
                  {session.mode === "live" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      isDisabled={!!checking}
                      onPress={() => void check(r)}
                    >
                      {checking === r.url ? "检测中…" : "检测链接"}
                    </Button>
                  )}
                  <Button size="sm" variant="secondary" onPress={() => copy(r)}>
                    <Copy size={14} />
                    复制链接
                  </Button>
                  {(r.url.startsWith("magnet:") || is115ShareURL(r.url)) && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onPress={() => {
                        setDownload(r);
                        setError("");
                      }}
                    >
                      <DownloadIcon size={14} />
                      {r.url.startsWith("magnet:") ? "离线下载" : "分享转存"}
                    </Button>
                  )}
                </div>
              </Card>
            ))}
          </div>
          {!links.length && <Empty>尚未找到资源，请稍后重新搜索。</Empty>}
          <p className="media-note">
            {session.mode === "demo"
              ? "以上均为演示链接，没有真实资源。"
              : "结果来自已配置的搜索来源。插件结果可能分批到达，可稍后重新搜索。"}
          </p>
        </>
      )}
      {!result && !busy && !error && (
        <Empty>输入关键词，或从作品详情进入资源搜索。</Empty>
      )}
      {busy && <Empty>正在聚合搜索结果，请稍候…</Empty>}
      {download && (
        <DownloadDialog
          url={download.url}
          title={submitted}
          password={download.password}
          media={
            media || savedResult?.media
              ? mediaContextFromRecord((media || savedResult?.media)!)
              : undefined
          }
          session={session}
          close={() => setDownload(null)}
          created={(task) => {
            onDownloaded(task);
            notify(session.mode === "demo" ? "已添加演示任务" : "任务已提交");
          }}
        />
      )}
    </>
  );
}
