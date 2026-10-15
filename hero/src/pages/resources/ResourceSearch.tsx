import { Button,Card,Chip,Input } from "@heroui/react";
import {
Copy,
Download as DownloadIcon,
RefreshCw,
Search,
} from "lucide-react";
import { Empty,FilterTabs,type API } from "../../components/media/MediaUI";
import { resourceHealthKey } from "../../hooks/useResourceHealth";
import { useResourceSearch } from "../../hooks/useResourceSearch";
import { is115ShareURL } from "../../lib/download-api";
import type { MediaSummary } from "../../lib/media-contract";
import { safeURL,type Download,type Session } from "../../lib/media-service";
import { cloudLabels } from "../../lib/parity";
import { RESOURCE_SEARCH_HISTORY_KEY } from "../../lib/resource-search";
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
  const {
    query,
    setQuery,
    submitted,
    result,
    cloud,
    setCloud,
    error,
    busy,
    history,
    setHistory,
    updating,
    health,
    checking,
    downloading,
    mediaHistory,
    setMediaHistory,
    search,
    links,
    transfer,
    copy,
    check,
  } = useResourceSearch({
    api,
    session,
    initialQuery,
    notify,
    onDownloaded,
    media,
    back,
  });
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
        {(history.length > 0 || mediaHistory.length > 0) && (
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
                setMediaHistory([]);
                try {
                  localStorage.removeItem(RESOURCE_SEARCH_HISTORY_KEY);
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
      {mediaHistory.length > 0 && (
        <Card className="management-card">
          <h3>影视探索搜索记录</h3>
          {mediaHistory.slice(0, 5).map((h) => (
            <p key={`${h.source}-${h.at}`}>
              {h.keyword} · {h.source} · {new Date(h.at).toLocaleString()}
            </p>
          ))}
        </Card>
      )}
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
              ...Object.keys(result.linksByCloud)
                .filter((k) => result.linksByCloud[k].length)
                .map((k) => [
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
                {health[resourceHealthKey(r)] && (
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
                    )[health[resourceHealthKey(r)].state] ||
                      health[resourceHealthKey(r)].state}{" "}
                    · {health[resourceHealthKey(r)].summary}
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
                      isDisabled={!!downloading || session.mode !== "live"}
                      onPress={() => void transfer(r)}
                    >
                      <DownloadIcon size={14} />
                      {downloading === r.url
                        ? "提交中…"
                        : r.url.startsWith("magnet:")
                          ? "115 离线下载"
                          : "转存到 115"}
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
    </>
  );
}
