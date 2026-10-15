import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button, Card, Chip, Input } from "@heroui/react";
import {
  Copy,
  Download as DownloadIcon,
  RefreshCw,
  Search,
} from "lucide-react";
import { Overlay } from "./App";
import {
  read,
  request,
  safeURL,
  save,
  service,
  type Download,
  type Resource,
  type Resources,
  type Session,
} from "./media-service";
import { errorText, time, FilterTabs, Empty, type API } from "./MediaUI";
const cloudLabels: Record<string, string> = {
  magnet: "磁力",
  "115": "115 网盘",
  quark: "夸克",
  aliyun: "阿里云盘",
  baidu: "百度网盘",
};

export function ResourceSearch({
  api,
  session,
  initialQuery,
  notify,
  onDownloaded,
}: {
  api: API;
  session: Session;
  initialQuery: string;
  notify: (s: string) => void;
  onDownloaded: (d: Download) => void;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [submitted, setSubmitted] = useState("");
  const [result, setResult] = useState<Resources | null>(null);
  const [cloud, setCloud] = useState("all");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState(() =>
    read<string[]>("mediahub.hero.search-history", []),
  );
  const [download, setDownload] = useState<Resource | null>(null);
  const [directory, setDirectory] = useState("");
  const [saving, setSaving] = useState(false);
  const searchRun = useRef(0);
  useEffect(
    () => () => {
      searchRun.current++;
    },
    [],
  );
  async function search(value = query, force = false) {
    if (!value.trim()) return;
    const run = ++searchRun.current;
    setBusy(true);
    setError("");
    setSubmitted(value.trim());
    setResult(null);
    try {
      const r = await api.search(value.trim(), force);
      if (run !== searchRun.current) return;
      setResult(r);
      setCloud("all");
      const next = [
        value.trim(),
        ...history.filter((q) => q !== value.trim()),
      ].slice(0, 10);
      setHistory(next);
      save("mediahub.hero.search-history", next);
    } catch (e) {
      if (run === searchRun.current) setError(errorText(e));
    } finally {
      if (run === searchRun.current) setBusy(false);
    }
  }
  useEffect(() => {
    if (initialQuery) void search(initialQuery);
  }, []);
  const links = Object.entries(result?.linksByCloud || {})
    .filter(([key]) => cloud === "all" || cloud === key)
    .flatMap(([key, values]) =>
      values.map((r) => ({ ...r, cloud: r.cloud || key })),
    );
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
  async function submitDownload(e: FormEvent) {
    e.preventDefault();
    if (!download || !directory.trim()) return;
    setSaving(true);
    setError("");
    try {
      const magnet = download.url.startsWith("magnet:");
      const task =
        session.mode === "demo"
          ? {
              id: crypto.randomUUID(),
              state: "demo",
              resourceId: download.url,
              progress: 0,
              createdAt: new Date().toISOString(),
            }
          : (
              await request<{ task: Download }>(
                "/api/v1/downloads",
                session,
                "POST",
                {
                  kind: magnet ? "offline" : "share_transfer",
                  url: download.url,
                  directoryId: directory.trim(),
                  wholeShare: !magnet,
                  receiveCode: download.password || "",
                  reference: {
                    source: "resource-search",
                    media: { title: submitted },
                  },
                },
              )
            ).task;
      onDownloaded(task);
      setDownload(null);
      notify(
        session.mode === "demo"
          ? "已添加演示任务，不会执行真实下载"
          : "任务已提交",
      );
    } catch (e) {
      setError(errorText(e));
    } finally {
      setSaving(false);
    }
  }
  return (
    <>
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
                save("mediahub.hero.search-history", []);
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
      {result && (
        <>
          <div className="media-section-heading">
            <h2>
              “{submitted}” 的搜索结果<small>{links.length} 条链接</small>
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
              ["all", "全部"],
              ...Object.keys(result.linksByCloud).map((k) => [
                k,
                cloudLabels[k] || k,
              ]),
            ]}
            onChange={setCloud}
          />
          <div className="resource-grid">
            {links.map((r, i) => (
              <Card className="resource-card" key={`${r.url}-${i}`}>
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
                {r.password && <p>提取码：{r.password}</p>}
                <div className="resource-actions">
                  <Button size="sm" variant="secondary" onPress={() => copy(r)}>
                    <Copy size={14} />
                    复制链接
                  </Button>
                  {(r.url.startsWith("magnet:") ||
                    /^https:\/\/(115\.com|115cdn\.com|anxia\.com)\/s\/[A-Za-z0-9]+/.test(
                      r.url,
                    )) && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onPress={() => {
                        setDownload(r);
                        setError("");
                      }}
                    >
                      <DownloadIcon size={14} />
                      {r.url.startsWith("magnet:") ? "离线下载" : "整份转存"}
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
        <Overlay
          title={
            download.url.startsWith("magnet:")
              ? "提交 115 离线下载"
              : "整份分享转存到 115"
          }
          onClose={() => setDownload(null)}
        >
          <form className="media-form" onSubmit={submitDownload}>
            <p>{submitted}</p>
            <p className="media-note">
              {session.mode === "demo"
                ? "此操作只创建本地演示记录。"
                : download.url.startsWith("magnet:")
                  ? "确认后由已连接的 115 服务执行离线下载。"
                  : "确认后转存整个分享。需要选择单个文件时请使用原前端。"}
            </p>
            <label>
              115 目标目录 ID
              <Input
                aria-label="115 目标目录 ID"
                value={directory}
                onChange={(e) => setDirectory(e.target.value)}
                placeholder="例如 0（根目录）"
                required
              />
            </label>
            {error && (
              <p role="alert" className="media-error">
                {error}
              </p>
            )}
            <Button type="submit" isDisabled={saving}>
              {saving ? "正在提交…" : "确认提交"}
            </Button>
          </form>
        </Overlay>
      )}
    </>
  );
}

export function DownloadList({
  tasks,
  session,
  update,
  notify,
}: {
  tasks: Download[];
  session: Session;
  update: (d: Download[]) => void;
  notify: (s: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  async function refresh() {
    setBusy(true);
    try {
      update(await service(session).downloads());
    } catch (e) {
      notify(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="media-section-heading">
        <h2>
          任务记录<small>{tasks.length} 项</small>
        </h2>
        <Button variant="secondary" isDisabled={busy} onPress={refresh}>
          <RefreshCw size={14} />
          刷新状态
        </Button>
      </div>
      {tasks.length ? (
        <div className="resource-grid">
          {tasks.map((t) => (
            <Card className="resource-card" key={t.id}>
              <div>
                <DownloadIcon size={20} />
                <Chip variant="soft" size="sm">
                  {(
                    {
                      demo: "演示任务",
                      queued: "排队中",
                      running: "进行中",
                      completed: "已完成",
                      failed: "失败",
                      cancelled: "已取消",
                    } as Record<string, string>
                  )[t.state] || t.state}
                </Chip>
              </div>
              <h3>{t.resourceId || t.id}</h3>
              <progress max="100" value={t.progress} />
              <p>
                {t.progress}% · {time(t.createdAt)}
              </p>
              {t.error && <p className="media-error">{t.error}</p>}
            </Card>
          ))}
        </div>
      ) : (
        <Empty>还没有下载任务，可以从资源搜索中提交。</Empty>
      )}
    </>
  );
}
