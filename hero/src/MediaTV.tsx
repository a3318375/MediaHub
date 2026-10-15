import { useState, type FormEvent } from "react";
import { Button, Card, Chip, Input } from "@heroui/react";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  RefreshCw,
  Trash2,
  Tv,
} from "lucide-react";
import { is115ShareURL } from "./lib/download-api";
import { Overlay } from "./App";
import { image, safeURL, type TV, type TVDraft } from "./media-service";
import { errorText, dateCN, time, FilterTabs, Empty } from "./MediaUI";
export function TVEditor({
  value,
  close,
  submit,
}: {
  value: TV | TVDraft;
  close: () => void;
  submit: (d: TVDraft) => Promise<void>;
}) {
  const [draft, setDraft] = useState<TVDraft>({ ...value });
  const [channels, setChannels] = useState(value.channels.join(", "));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function saveDraft(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (
      !draft.title.trim() ||
      !/^\d+$/.test(draft.tmdbId) ||
      !Number.isInteger(draft.season) ||
      draft.season < 1
    ) {
      setError("请填写标题、数字 TMDB ID 和有效季数");
      return;
    }
    try {
      if (draft.match) new RegExp(draft.match);
      if (draft.exclude) new RegExp(draft.exclude);
    } catch {
      setError("资源匹配或排除正则无效");
      return;
    }
    const selected = channels
      .split(/[,，\s]+/)
      .map((c) => c.replace(/^@/, ""))
      .filter(Boolean);
    if (draft.source === "tg" && !selected.length) {
      setError("TG 模式请至少填写一个公开频道");
      return;
    }
    setBusy(true);
    try {
      await submit({
        ...draft,
        title: draft.title.trim(),
        channels: draft.source === "tg" ? selected : [],
      });
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Overlay
      title={"id" in value ? "编辑电视剧订阅" : "添加电视剧订阅"}
      onClose={close}
    >
      <form className="media-form" onSubmit={saveDraft}>
        <label>
          剧名
          <Input
            aria-label="剧名"
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            required
          />
        </label>
        <div className="media-form-row">
          <label>
            TMDB 电视剧 ID
            <Input
              aria-label="TMDB 电视剧 ID"
              value={draft.tmdbId}
              onChange={(e) => setDraft({ ...draft, tmdbId: e.target.value })}
              inputMode="numeric"
              required
            />
          </label>
          <label>
            季数
            <Input
              aria-label="季数"
              type="number"
              min="1"
              value={String(draft.season)}
              onChange={(e) =>
                setDraft({ ...draft, season: Number(e.target.value) })
              }
              required
            />
          </label>
        </div>
        <FilterTabs
          label="搜索来源"
          value={draft.source}
          options={[
            ["tg", "TG 公开频道"],
            ["pansou", "PanSou"],
          ]}
          onChange={(v) =>
            setDraft({ ...draft, source: v as TVDraft["source"] })
          }
        />
        {draft.source === "tg" && (
          <label>
            公开频道（逗号分隔）
            <Input
              aria-label="公开频道"
              value={channels}
              onChange={(e) => setChannels(e.target.value)}
              placeholder="channel_one, channel_two"
            />
          </label>
        )}
        <label>
          资源匹配正则
          <Input
            aria-label="资源匹配正则"
            value={draft.match}
            onChange={(e) => setDraft({ ...draft, match: e.target.value })}
            placeholder="可选，例如 1080p|2160p"
          />
        </label>
        <label>
          排除正则
          <Input
            aria-label="排除正则"
            value={draft.exclude}
            onChange={(e) => setDraft({ ...draft, exclude: e.target.value })}
            placeholder="可选"
          />
        </label>
        <FilterTabs
          label="状态"
          value={draft.enabled ? "on" : "off"}
          options={[
            ["on", "启用"],
            ["off", "暂停"],
          ]}
          onChange={(v) => setDraft({ ...draft, enabled: v === "on" })}
        />
        <p className="media-note">
          沿用现有服务的按播出日检查、未找到补查与资源优选策略。
        </p>
        {error && (
          <p role="alert" className="media-error">
            {error}
          </p>
        )}
        <div className="media-form-actions">
          <Button variant="secondary" onPress={close}>
            取消
          </Button>
          <Button type="submit" isDisabled={busy}>
            {busy ? "正在保存…" : "保存订阅"}
          </Button>
        </div>
      </form>
    </Overlay>
  );
}

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

export function Calendar({
  items,
  edit,
  download,
}: {
  items: TV[];
  edit: (s: TV) => void;
  download: (tv: TV, resource: TV["resources"][number]) => void;
}) {
  const [selectedEvent, setSelectedEvent] = useState<{
    subscription: TV;
    number: number;
    name: string;
    airDate: string;
  } | null>(null);
  const [month, setMonth] = useState(
    () => new Date(`${dateCN(new Date()).slice(0, 7)}-01T12:00:00+08:00`),
  );
  const year = Number(dateCN(month).slice(0, 4)),
    mon = Number(dateCN(month).slice(5, 7)) - 1;
  const first = new Date(Date.UTC(year, mon, 1)).getUTCDay();
  const count = new Date(Date.UTC(year, mon + 1, 0)).getUTCDate();
  const events = items.flatMap((s) =>
    s.episodes.map((e) => ({ ...e, subscription: s })),
  );
  function shift(offset: number) {
    setMonth(new Date(Date.UTC(year, mon + offset, 1, 4)));
  }
  return (
    <Card className="media-calendar">
      <div className="media-section-heading">
        <h2>
          {year} 年 {mon + 1} 月
        </h2>
        <div>
          <Button
            variant="ghost"
            isIconOnly
            aria-label="上个月"
            onPress={() => shift(-1)}
          >
            <ChevronLeft size={18} />
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onPress={() =>
              setMonth(
                new Date(`${dateCN(new Date()).slice(0, 7)}-01T12:00:00+08:00`),
              )
            }
          >
            本月
          </Button>
          <Button
            variant="ghost"
            isIconOnly
            aria-label="下个月"
            onPress={() => shift(1)}
          >
            <ChevronRight size={18} />
          </Button>
        </div>
      </div>
      <div className="calendar-scroll">
        <div className="calendar-grid">
          {["一", "二", "三", "四", "五", "六", "日"].map((d) => (
            <div className="calendar-weekday" key={d}>
              周{d}
            </div>
          ))}
          {Array.from({ length: (first + 6) % 7 }, (_, i) => (
            <div className="calendar-day outside" key={`empty-${i}`} />
          ))}
          {Array.from({ length: count }, (_, i) => {
            const date = `${year}-${String(mon + 1).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`;
            return (
              <div
                className={`calendar-day ${date === dateCN(new Date()) ? "today" : ""}`}
                key={date}
              >
                <span>{i + 1}</span>
                {events
                  .filter((e) => e.airDate === date)
                  .map((e) => (
                    <button
                      key={`${e.subscription.id}-${e.number}`}
                      className={
                        e.subscription.resources.some(
                          (r) =>
                            r.episode === e.number ||
                            !!(
                              r.collectionEnd &&
                              r.episode <= e.number &&
                              r.collectionEnd >= e.number
                            ),
                        )
                          ? "found"
                          : ""
                      }
                      onClick={() => setSelectedEvent(e)}
                    >
                      <strong>{e.subscription.title}</strong>
                      <small>
                        E{String(e.number).padStart(2, "0")} ·{" "}
                        {e.subscription.resources.some(
                          (r) =>
                            r.episode === e.number ||
                            !!(
                              r.collectionEnd &&
                              r.episode <= e.number &&
                              r.collectionEnd >= e.number
                            ),
                        )
                          ? "资源已找到"
                          : e.subscription.enabled
                            ? "等待资源"
                            : "订阅暂停"}
                      </small>
                    </button>
                  ))}
              </div>
            );
          })}
        </div>
      </div>
      {selectedEvent && (
        <Overlay
          title={`${selectedEvent.subscription.title} · 第 ${selectedEvent.number} 集`}
          onClose={() => setSelectedEvent(null)}
        >
          <div className="management-stack">
            <p>
              {selectedEvent.name} · {selectedEvent.airDate}
            </p>
            <Button
              variant="secondary"
              onPress={() => {
                edit(selectedEvent.subscription);
                setSelectedEvent(null);
              }}
            >
              编辑订阅规则
            </Button>
            {selectedEvent.subscription.resources
              .filter(
                (r) =>
                  r.episode === selectedEvent.number ||
                  (r.collectionEnd &&
                    r.episode <= selectedEvent.number &&
                    r.collectionEnd >= selectedEvent.number),
              )
              .map((r, i) => (
                <div className="management-stack" key={i}>
                  <a href={safeURL(r.url)} target="_blank" rel="noreferrer">
                    {r.title}
                  </a>
                  {(r.url.startsWith("magnet:") || is115ShareURL(r.url)) && (
                    <Button
                      onPress={() => {
                        download(selectedEvent.subscription, r);
                        setSelectedEvent(null);
                      }}
                    >
                      下载 / 转存
                    </Button>
                  )}
                </div>
              ))}
            {!selectedEvent.subscription.resources.some(
              (r) =>
                r.episode === selectedEvent.number ||
                (r.collectionEnd &&
                  r.episode <= selectedEvent.number &&
                  r.collectionEnd >= selectedEvent.number),
            ) && <Empty>尚未找到本集资源，可在订阅页检查更新。</Empty>}
          </div>
        </Overlay>
      )}
      <p className="media-note">
        播出日期按北京时间展示。新建订阅的播出资料由服务端读取；演示模式不会生成真实播出计划。
      </p>
    </Card>
  );
}
