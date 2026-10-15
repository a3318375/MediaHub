import { useState } from "react";

import { Button } from "@heroui/react";


import { Overlay } from '../../components/ui/Overlay';

import {
animeApi,
emptyAnimeDraft,
type AnimeDraft,
type AnimePreview,
type MikanGroup,
type MikanItem,
type SavedAnimeSubscription,
} from "../../lib/anime-api";


import { image,type Session } from "../../lib/media-service";

import {
Field,
Notice,
SelectField,
Toggle
} from "../../components/ui/ManagementUI";


import { Poster,errorText } from "../../components/media/MediaUI";
import { animeMedia } from '../../lib/anime-presentation';


const sources = [
  ["mikan", "蜜柑计划"],
  ["ani-bt", "Ani-BT"],
  ["anime-garden", "Anime Garden"],
  ["other", "自定义 RSS"],
];

export function AnimeEditor({
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
