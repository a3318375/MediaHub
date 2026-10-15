import { useState } from "react";

import { Button,Card,Chip } from "@heroui/react";

import {
Plus,
RefreshCw,
Trash2,
Tv
} from "lucide-react";

import { is115ShareURL } from "../../lib/download-api";

import { Overlay } from '../../components/ui/Overlay';

import { image,safeURL,type TV } from "../../lib/media-service";

import { Empty,FilterTabs,time } from "../../components/media/MediaUI";
export { Calendar } from './Calendar';
export { TVEditor } from './TVEditor';


export function TVList({
  items,
  edit,
  action,
  add,
  download,
}: {
  items: TV[];
  edit: (s: TV) => void;
  action: (s: TV, a: "toggle" | "refresh" | "remove") => Promise<void>;
  add: () => void;
  download: (tv: TV, resource: TV["resources"][number]) => void;
}) {
  const [filter, setFilter] = useState("all");
  const [remove, setRemove] = useState<TV | null>(null);
  const [busy, setBusy] = useState("");
  async function act(s: TV, a: "toggle" | "refresh" | "remove") {
    setBusy(s.id);
    await action(s, a);
    setBusy("");
    if (a === "remove") setRemove(null);
  }
  const selected = items.filter(
    (s) => filter === "all" || s.enabled === (filter === "active"),
  );
  return (
    <>
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
      {selected.length ? (
        <div className="subscription-grid">
          {selected.map((s, i) => (
            <Card className="subscription-card" key={s.id}>
              <div className="subscription-top">
                <div className={`subscription-art palette-${i % 6}`}>
                  {s.poster ? (
                    <img src={image(s.poster)} alt="" />
                  ) : (
                    <Tv size={26} />
                  )}
                </div>
                <div>
                  <h2>{s.title}</h2>
                  <p>
                    第 {s.season} 季 ·{" "}
                    {s.source === "tg" ? "TG 频道" : "PanSou"}
                  </p>
                  <Chip
                    size="sm"
                    variant="soft"
                    color={s.enabled ? "success" : "default"}
                  >
                    {s.enabled ? "追踪中" : "已暂停"}
                  </Chip>
                </div>
              </div>
              <div className="subscription-progress">
                <span>
                  播出资料 <strong>{s.episodes.length} 集</strong>
                </span>
                <span>
                  已找到资源 <strong>{s.resources.length} 条</strong>
                </span>
              </div>
              <p className="media-note">上次检查：{time(s.lastCheckedAt)}</p>
              {s.nextCheckAt && (
                <p className="media-note">下次检查：{time(s.nextCheckAt)}</p>
              )}
              {(s.lastError || s.metadataError) && (
                <p className="media-error">{s.lastError || s.metadataError}</p>
              )}
              {s.resources.length > 0 && (
                <details>
                  <summary>查看已找到资源</summary>
                  {s.resources.map((r, j) => (
                    <div className="management-row" key={j}>
                      <a
                        className="subscription-resource"
                        href={safeURL(r.url)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        E{r.episode}
                        {r.collectionEnd ? `–${r.collectionEnd}` : ""} ·{" "}
                        {r.title}
                      </a>
                      {(r.url.startsWith("magnet:") ||
                        is115ShareURL(r.url)) && (
                        <Button
                          size="sm"
                          variant="secondary"
                          onPress={() => download(s, r)}
                        >
                          下载 / 转存
                        </Button>
                      )}
                    </div>
                  ))}
                </details>
              )}
              <div className="subscription-actions">
                <Button size="sm" variant="secondary" onPress={() => edit(s)}>
                  编辑规则
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  isDisabled={busy === s.id}
                  onPress={() => act(s, "toggle")}
                >
                  {s.enabled ? "暂停" : "恢复"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  isDisabled={busy === s.id}
                  onPress={() => act(s, "refresh")}
                >
                  <RefreshCw size={14} />
                  检查
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
    </>
  );
}
