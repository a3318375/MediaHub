import { useEffect, useState } from "react";
import { Button } from "@heroui/react";
import { Plus, RefreshCw, Download, Ellipsis } from "lucide-react";
import { Overlay } from "./App";
import {
  animeApi,
  emptyAnimeDraft,
  type AnimeDraft,
  type AnimePreview,
  type SavedAnimeSubscription,
  type MikanItem,
  type MikanGroup,
} from "./lib/anime-api";
import {
  downloadApi,
  directoryIdFromInput,
  type AnimeDownloadCandidate,
} from "./lib/download-api";
import { read, save, safeURL, image, type Session } from "./media-service";
import {
  Field,
  Toggle,
  SelectField,
  Notice,
  DirectoryField,
} from "./ManagementUI";
import type { MediaSummary } from "./media-contract";
import { Empty, FilterTabs, Poster, errorText, time } from "./MediaUI";

const sources = [
  ["mikan", "蜜柑计划"],
  ["ani-bt", "Ani-BT"],
  ["anime-garden", "Anime Garden"],
  ["other", "自定义 RSS"],
];
function animeMedia(a: {
  id: string;
  title: string;
  poster: string;
  description?: string;
  rating?: string;
  releaseDate?: string;
  originalTitle?: string;
  bangumiId?: string;
}): MediaSummary {
  const rating = Number(a.rating);
  return {
    mediaId: `anime-subscription:${a.id}`,
    provider: "bangumi",
    providerId: a.bangumiId || a.id,
    source: "bangumi",
    sourceId: a.bangumiId || a.id,
    mediaType: "anime",
    title: a.title,
    originalTitle: a.originalTitle,
    posterPath: a.poster,
    overview: a.description,
    year: a.releaseDate
      ? Number(a.releaseDate.slice(0, 4)) || undefined
      : undefined,
    genres: [],
    ratings:
      Number.isFinite(rating) && rating > 0
        ? [{ source: "bangumi", value: rating }]
        : [],
  };
}
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
function AnimeEditor({
  session,
  close,
  created,
}: {
  session: Session;
  close: () => void;
  created: (a: SavedAnimeSubscription) => void;
}) {
  const [draft, setDraft] = useState<AnimeDraft>(emptyAnimeDraft);
  const [query, setQuery] = useState("");
  const [season, setSeason] = useState("");
  const [seasons, setSeasons] = useState<string[]>([]);
  const [catalog, setCatalog] = useState<MikanItem[]>([]);
  const [groups, setGroups] = useState<MikanGroup[]>([]);
  const [selected, setSelected] = useState<MikanItem | null>(null);
  const [preview, setPreview] = useState<AnimePreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const change = <K extends keyof AnimeDraft>(k: K, v: AnimeDraft[K]) => {
    setDraft((d) => ({ ...d, [k]: v }));
    setPreview(null);
  };
  async function act(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  async function resolve(value: AnimeDraft) {
    await act(async () => {
      setDraft(await animeApi.resolve(value));
      setPreview(null);
    });
  }
  return (
    <Overlay title="添加动漫订阅" onClose={close}>
      <div className="management-stack">
        <Notice error={error} />
        <fieldset disabled={busy} className="management-stack">
          <SelectField
            label="订阅来源"
            value={draft.source}
            options={sources}
            onChange={(v) => {
              change("source", v as AnimeDraft["source"]);
              setCatalog([]);
              setGroups([]);
              setSelected(null);
              setSeasons([]);
              setSeason("");
            }}
          />
          {session.mode === "live" && draft.source !== "other" && (
            <>
              <form
                className="management-stack"
                onSubmit={(e) => {
                  e.preventDefault();
                  void act(async () => {
                    const r = await animeApi.catalog(
                      query,
                      season,
                      true,
                      undefined,
                      draft.source,
                    );
                    setCatalog(r.items);
                    setSeasons(r.seasons);
                    setGroups([]);
                  });
                }}
              >
                <Field label="搜索番剧" value={query} onChange={setQuery} />
                <SelectField
                  label="播出季度"
                  value={season}
                  options={[["", "全部"], ...seasons.map((s) => [s, s])]}
                  onChange={setSeason}
                />
                <Button type="submit">浏览片库</Button>
              </form>
              <div className="poster-grid anime-catalog-posters">
                {catalog.map((i, index) => (
                  <Poster
                    key={i.id}
                    index={index}
                    media={animeMedia(i)}
                    onOpen={() =>
                      void act(async () => {
                        setSelected(i);
                        setGroups(
                          await animeApi.groups(i.id, undefined, draft.source),
                        );
                        setDraft((d) => ({
                          ...d,
                          title: i.title,
                          poster: i.poster,
                          mikanId: d.source === "mikan" ? i.id : "",
                        }));
                      })
                    }
                    actions={
                      <Button
                        size="sm"
                        variant="secondary"
                        onPress={() =>
                          void act(async () => {
                            setSelected(i);
                            setGroups(
                              await animeApi.groups(
                                i.id,
                                undefined,
                                draft.source,
                              ),
                            );
                            setDraft((d) => ({
                              ...d,
                              title: i.title,
                              poster: i.poster,
                              mikanId: d.source === "mikan" ? i.id : "",
                            }));
                          })
                        }
                      >
                        选择
                      </Button>
                    }
                  />
                ))}
              </div>
              {selected && <h3>{selected.title} · 选择字幕组</h3>}
              {groups.map((g, i) => (
                <div
                  key={`${g.url}-${i}`}
                  className="management-card management-stack"
                >
                  <Button
                    variant="secondary"
                    onPress={() =>
                      void resolve({
                        ...draft,
                        title: selected?.title || draft.title,
                        url: g.url,
                        subgroup: g.label,
                        bangumiId: g.bangumiId,
                        match: [],
                      })
                    }
                  >
                    {g.label} · 全部版本
                  </Button>
                  {g.groupRegex?.regexList.map((rules, j) => (
                    <Button
                      key={j}
                      variant="ghost"
                      onPress={() =>
                        void resolve({
                          ...draft,
                          url: g.url,
                          subgroup: g.label,
                          bangumiId: g.bangumiId,
                          match: rules.map((r) => r.regex),
                        })
                      }
                    >
                      {rules.map((r) => r.label).join(" / ")}
                    </Button>
                  ))}
                </div>
              ))}
            </>
          )}
          <Field
            label="主 RSS 地址"
            value={draft.url}
            onChange={(v) => change("url", v)}
            required
          />
          {session.mode === "live" && (
            <Button
              variant="secondary"
              isDisabled={!draft.url}
              onPress={() => void resolve(draft)}
            >
              解析 RSS 与元数据
            </Button>
          )}
          <form
            className="management-stack"
            onSubmit={(e) => {
              e.preventDefault();
              void act(async () => {
                if (!draft.title.trim() || !draft.url.trim())
                  throw new Error("请填写标题和 RSS 地址");
                for (const regex of [...draft.match, ...draft.exclude])
                  new RegExp(regex);
                if (!Number.isInteger(draft.season) || draft.season < 1)
                  throw new Error("季数必须为正整数");
                if (session.mode === "live")
                  created(await animeApi.create(draft));
                else
                  created({
                    ...draft,
                    id: crypto.randomUUID(),
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    latestEpisode: 0,
                    knownEpisodes: [],
                    completed: false,
                    lastCheckedAt: "",
                    lastError: "",
                    lastMetadataAt: "",
                    metadataError: "",
                    resources: [],
                  });
              });
            }}
          >
            <Field
              label="标题"
              value={draft.title}
              onChange={(v) => change("title", v)}
              required
            />
            <Field
              label="原名"
              value={draft.originalTitle}
              onChange={(v) => change("originalTitle", v)}
            />
            <div className="management-grid">
              <Field
                label="Bangumi ID"
                value={draft.bangumiId}
                onChange={(v) => change("bangumiId", v)}
              />
              <Field
                label="蜜柑 ID"
                value={draft.mikanId}
                onChange={(v) => change("mikanId", v)}
              />
              <Field
                label="字幕组"
                value={draft.subgroup}
                onChange={(v) => change("subgroup", v)}
              />
              <Field
                label="季数"
                type="number"
                value={draft.season}
                onChange={(v) => change("season", Number(v))}
              />
              <Field
                label="集数偏移"
                type="number"
                value={draft.offset}
                onChange={(v) => change("offset", Number(v))}
              />
              <Field
                label="总集数（未知填 0）"
                type="number"
                value={draft.totalEpisodes}
                onChange={(v) => change("totalEpisodes", Number(v))}
              />
              <SelectField
                label="更新日"
                value={String(draft.week)}
                options={[
                  ["0", "未知"],
                  ...[1, 2, 3, 4, 5, 6, 7].map((n) => [
                    String(n),
                    `周${"一二三四五六日"[n - 1]}`,
                  ]),
                ]}
                onChange={(v) => change("week", Number(v))}
              />
              <Field
                label="首播日期"
                type="date"
                value={draft.releaseDate}
                onChange={(v) => change("releaseDate", v)}
              />
            </div>
            <Field
              label="海报地址"
              value={draft.poster}
              onChange={(v) => change("poster", v)}
            />
            {draft.poster && (
              <img
                className="anime-preview-poster"
                src={image(draft.poster)}
                alt="订阅海报"
              />
            )}
            <Field
              label="简介"
              value={draft.description}
              onChange={(v) => change("description", v)}
            />
            <Field
              label="评分"
              value={draft.rating}
              onChange={(v) => change("rating", v)}
            />
            <label className="management-field">
              匹配正则（每行一个）
              <textarea
                rows={3}
                value={draft.match.join("\n")}
                onChange={(e) =>
                  change("match", e.target.value.split("\n").filter(Boolean))
                }
              />
            </label>
            <label className="management-field">
              排除正则（每行一个）
              <textarea
                rows={3}
                value={draft.exclude.join("\n")}
                onChange={(e) =>
                  change("exclude", e.target.value.split("\n").filter(Boolean))
                }
              />
            </label>
            <h3>备用 RSS</h3>
            {draft.standby.map((f, i) => (
              <div key={i} className="management-card management-stack">
                {(
                  [
                    ["label", "字幕组"],
                    ["url", "RSS 地址"],
                    ["offset", "集数偏移"],
                  ] as const
                ).map(([k, label]) => (
                  <Field
                    key={k}
                    label={label}
                    type={k === "offset" ? "number" : "text"}
                    value={f[k]}
                    onChange={(v) =>
                      change(
                        "standby",
                        draft.standby.map((a, j) =>
                          j === i
                            ? { ...a, [k]: k === "offset" ? Number(v) : v }
                            : a,
                        ),
                      )
                    }
                  />
                ))}
                <Button
                  variant="ghost"
                  onPress={() =>
                    change(
                      "standby",
                      draft.standby.filter((_, j) => j !== i),
                    )
                  }
                >
                  移除备用源
                </Button>
              </div>
            ))}
            <Button
              variant="secondary"
              onPress={() =>
                change("standby", [
                  ...draft.standby,
                  { label: "", url: "", offset: 0 },
                ])
              }
            >
              添加备用源
            </Button>
            <Toggle
              label="启用订阅"
              checked={draft.enabled}
              onChange={(v) => change("enabled", v)}
            />
            {session.mode === "live" && (
              <Button
                variant="secondary"
                onPress={() =>
                  void act(async () =>
                    setPreview(await animeApi.preview(draft)),
                  )
                }
              >
                预览匹配资源
              </Button>
            )}
            {preview && (
              <div className="management-stack">
                <p>匹配 {preview.accepted} 条</p>
                {preview.warnings.map((w, i) => (
                  <Notice key={i} error={w} />
                ))}
                {preview.items.map((r, i) => (
                  <p key={i}>
                    {r.accepted ? "✓" : "—"} {r.title} · 第 {r.episode ?? "?"}{" "}
                    集 {r.reason}
                  </p>
                ))}
              </div>
            )}
            <Button type="submit" isDisabled={busy}>
              {busy ? "正在处理…" : "保存订阅"}
            </Button>
          </form>
        </fieldset>
      </div>
    </Overlay>
  );
}
function AnimeDownloads({
  anime,
  session,
  close,
}: {
  anime: SavedAnimeSubscription;
  session: Session;
  close: () => void;
}) {
  const [useLibrary, setUseLibrary] = useState(true);
  const [rule, setRule] = useState({
    enabled: false,
    directoryId: "",
    fromEpisode: 1,
  });
  const [items, setItems] = useState<AnimeDownloadCandidate[]>([]);
  const [busy, setBusy] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => {
    const c = new AbortController();
    if (session.mode === "demo") {
      const saved = read(`mediahub.hero.anime-download.${anime.id}`, {
        enabled: false,
        directoryId: "",
        fromEpisode: 1,
      });
      setRule(saved);
      setUseLibrary(!saved.directoryId || saved.directoryId === "library");
      setLoaded(true);
      setBusy(false);
      return;
    }
    downloadApi
      .getAnime(anime.id, c.signal)
      .then((r) => {
        if (!c.signal.aborted) {
          setRule(r.rule);
          setUseLibrary(
            !r.rule.directoryId || r.rule.directoryId === "library",
          );
          setItems(r.items);
          setLoaded(true);
        }
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(errorText(e));
      })
      .finally(() => {
        if (!c.signal.aborted) setBusy(false);
      });
    return () => c.abort();
  }, [anime.id, session]);
  async function act(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Overlay title={`${anime.title} · 自动下载`} onClose={close}>
      <form
        className="management-stack"
        onSubmit={(e) => {
          e.preventDefault();
          void act(async () => {
            if (rule.fromEpisode < 1 || !Number.isInteger(rule.fromEpisode))
              throw new Error("起始集数必须为正整数");
            const value = {
              ...rule,
              directoryId: useLibrary
                ? "library"
                : directoryIdFromInput(rule.directoryId),
            };
            if (session.mode === "live")
              await downloadApi.saveAnime(anime.id, value);
            else save(`mediahub.hero.anime-download.${anime.id}`, value);
            setNotice("自动下载规则已保存");
          });
        }}
      >
        <Notice error={error}>{notice}</Notice>
        <Toggle
          label="自动下载匹配的集数"
          checked={rule.enabled}
          onChange={(v) => setRule({ ...rule, enabled: v })}
        />
        <Toggle
          label="按媒体库配置自动归类"
          checked={useLibrary}
          onChange={(v) => {
            setUseLibrary(v);
            if (!v && rule.directoryId === "library")
              setRule({ ...rule, directoryId: "" });
          }}
        />
        {useLibrary ? (
          <p className="media-note">
            使用影视整理中保存的未整理目录，并按动漫分类。
          </p>
        ) : (
          <DirectoryField
            label="115 目标目录"
            value={rule.directoryId}
            onChange={(v) => setRule({ ...rule, directoryId: v })}
            session={session}
          />
        )}
        <Field
          label="起始集数"
          type="number"
          value={rule.fromEpisode}
          onChange={(v) => setRule({ ...rule, fromEpisode: Number(v) })}
        />
        <Button type="submit" isDisabled={busy || !loaded}>
          保存规则
        </Button>
        <Button
          variant="secondary"
          isDisabled={busy || !loaded || session.mode === "demo"}
          onPress={() =>
            void act(async () => {
              const r = await downloadApi.retryAnime(anime.id);
              setItems((await downloadApi.getAnime(anime.id)).items);
              setNotice(`已重新排队 ${r.count} 项`);
            })
          }
        >
          重试失败候选
        </Button>
        {items
          .filter((i) => i.episode >= rule.fromEpisode)
          .map((i) => (
            <div className="management-row" key={i.id}>
              <div>
                {i.title}
                <small>
                  第 {i.episode} 集 · {i.state}
                  {i.error ? ` · ${i.error}` : ""}
                </small>
              </div>
            </div>
          ))}
        {!items.length && <p>尚无下载候选，订阅同步后自动生成。</p>}
      </form>
    </Overlay>
  );
}
