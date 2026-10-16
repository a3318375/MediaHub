import { useState, type ReactNode } from "react";

import { Button, Card, Chip } from "@heroui/react";

import { Plus, RefreshCw, Trash2, Tv } from "lucide-react";

import { is115ShareURL } from "../../lib/download-api";

import { Overlay } from "../../components/ui/Overlay";

import { image, safeURL, type TV } from "../../lib/media-service";

import { Field } from "../../components/ui/ManagementUI";
import { Empty, FilterTabs, time } from "../../components/media/MediaUI";
export { Calendar } from "./Calendar";
export { TVEditor } from "./TVEditor";

export function TVList({
  items,
  edit,
  action,
  add,
  download,
  calendar,
  loading = false,
  refresh,
}: {
  items: TV[];
  calendar?: ReactNode;
  loading?: boolean;
  refresh?: () => void;
  edit: (s: TV) => void;
  action: (s: TV, a: "toggle" | "refresh" | "remove") => Promise<void>;
  add: () => void;
  download: (tv: TV, resource: TV["resources"][number]) => void;
}) {
  const [query, setQuery] = useState("");
  const [showCalendar, setShowCalendar] = useState(false);
  const [filter, setFilter] = useState("all");
  const [details, setDetails] = useState<TV | null>(null);
  const [remove, setRemove] = useState<TV | null>(null);
  const [busy, setBusy] = useState("");
  async function act(s: TV, a: "toggle" | "refresh" | "remove") {
    if (busy) return;
    setBusy(s.id);
    try {
      await action(s, a);
      if (a === "remove") setRemove(null);
    } finally {
      setBusy("");
    }
  }
  const selected = items.filter(
    (s) => (filter === "all" || s.enabled === (filter === "active")) && s.title.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <section className="management-stack anime-subscription-page tv-subscription-page">
      <div className="media-section-heading">
        <div className="anime-page-title"><h1>追剧日历 <small>{items.length} 部</small></h1><p>管理剧集订阅、播出计划与资源更新。</p></div>
        <div className="management-actions anime-page-tools">
          <Field label="搜索追剧" value={query} onChange={setQuery} placeholder="搜索订阅…" />
          {calendar && <Button variant="secondary" aria-pressed={showCalendar} onPress={() => setShowCalendar(!showCalendar)}>{showCalendar ? "订阅列表" : "播出日历"}</Button>}
          {refresh && <Button variant="secondary" isDisabled={loading} onPress={refresh}><RefreshCw size={16} />刷新</Button>}
          <Button onPress={add}><Plus size={16} />添加追剧</Button>
        </div>
      </div>
      {showCalendar && calendar}
      <FilterTabs
        label="订阅状态"
        value={filter}
        options={[
          ["all", `全部 ${items.length}`],
          ["active", "追踪中"],
          ["paused", "已暂停"],
        ]}
        onChange={setFilter}
      />
      {loading ? <Empty>正在读取追剧订阅…</Empty> : selected.length ? (
        <div className="anime-subscription-grid">
          {selected.map((s) => (
            <Card className="anime-subscription-card tv-subscription-card" key={s.id}>
              <button className="anime-card-cover" aria-label={`编辑《${s.title}》订阅`} onClick={() => edit(s)}>
                {s.poster ? <img src={image(s.poster)} alt={s.title} loading="lazy" /> : <span className="tv-card-placeholder"><Tv size={36} /></span>}
                <div className="anime-card-badges"><Chip size="sm" variant="soft" color={s.enabled ? "success" : "default"}>{s.enabled ? "追踪中" : "已暂停"}</Chip></div>
                <span className="anime-card-rss">{s.source === "tg" ? "TG 频道" : "PanSou"}</span>
              </button>
              <div className="anime-card-body">
                <button className="anime-card-title" aria-label={`查看《${s.title}》订阅详情`} onClick={() => setDetails(s)}>{s.title}</button>
                <p className="tv-card-meta">{s.season === 0 ? "全部季度" : `第 ${s.season} 季`} · {s.episodes.length ? `${s.episodes.length} 集` : "集数待同步"}{(s.lastError || s.metadataError) && <span className="tv-card-warning"> · 异常</span>}</p>
              <div className="anime-card-actions tv-card-actions">
                <Button size="sm" variant="secondary" onPress={() => edit(s)}>
                  编辑
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  isDisabled={!!busy}
                  onPress={() => act(s, "toggle")}
                >
                  {s.enabled ? "暂停" : "恢复"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  isIconOnly
                  aria-label={`检查《${s.title}》更新`}
                  isDisabled={!!busy}
                  onPress={() => act(s, "refresh")}
                >
                  <RefreshCw size={14} />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  isIconOnly
                  aria-label={`删除 ${s.title}`}
                  onPress={() => setRemove(s)}
                >
                  <Trash2 size={14} />
                </Button>
              </div>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <Empty
          action={
            <Button onPress={add}>
              <Plus size={16} />
              添加订阅
            </Button>
          }
        >
          当前没有符合条件的订阅。
        </Empty>
      )}
      {details && <Overlay title={`${details.title} · 订阅详情`} onClose={() => setDetails(null)}><div className="management-stack">
              <p className="media-note">上次检查：{time(details.lastCheckedAt)}</p>
              {(!details.episodes.length || details.episodes.some((e) => !e.airDate)) && (
                <p className="media-note">
                  部分或全部播出日期未知，每天检查一次。
                </p>
              )}
              {details.nextCheckAt && (
                <p className="media-note">下次检查：{time(details.nextCheckAt)}</p>
              )}
              {(details.lastError || details.metadataError) && (
                <p className="media-error">
                  {[details.metadataError, details.lastError].filter(Boolean).join("；")}
                </p>
              )}

              {details.resources.length > 0 && (
                <div className="management-stack">
                  {details.resources.map((r, j) => (
                    <div className="management-row" key={j}>
                      <a
                        className="subscription-resource"
                        href={safeURL(r.url)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        S{String(r.season || details.season || 1).padStart(2, "0")}E{r.episode}
                        {r.collectionEnd ? `–${r.collectionEnd}` : ""} ·{" "}
                        {r.title} · {r.cloud === "115" ? "115 分享" : "磁力"} ·{" "}
                        {(r.size || 0) > 0
                          ? `${(r.size! / 1024 ** 3).toFixed(2)} GB`
                          : "体积未知"}
                      </a>
                      {r.password && <small>提取码：{r.password}</small>}
                      {(r.url.startsWith("magnet:") ||
                        is115ShareURL(r.url)) && (
                        <Button
                          size="sm"
                          variant="secondary"
                          onPress={() => download(details, r)}
                        >
                          下载 / 转存
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}

      {!details.resources.length && <Empty>尚未找到资源</Empty>}
      </div></Overlay>}
      {remove && (
        <Overlay
          title="删除订阅"
          onClose={() => setRemove(null)}
          footer={
            <>
              <Button variant="secondary" onPress={() => setRemove(null)}>
                取消
              </Button>
              <Button
                variant="danger"
                isDisabled={busy === remove.id}
                onPress={() => act(remove, "remove")}
              >
                删除订阅
              </Button>
            </>
          }
        >
          <p>
            删除《{remove.title}》第 {remove.season} 季的订阅与跟踪记录？
          </p>
        </Overlay>
      )}
    </section>
  );
}
