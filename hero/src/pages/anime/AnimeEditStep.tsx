import { Button } from "@heroui/react";
import {
  Field,
  Notice,
  SelectField,
  Toggle,
} from "../../components/ui/ManagementUI";
import { useAnimeEditor } from "../../hooks/useAnimeEditor";
import { animeApi, type SavedAnimeSubscription } from "../../lib/anime-api";
import { image, type Session } from "../../lib/media-service";
export function AnimeEditStep({
  setStep,
  selectedGroup,
  draft,
  matchText,
  setMatchText,
  excludeText,
  setExcludeText,
  preview,
  setPreview,
  busy,
  controller,
  change,
  act,
  session,
  created,
}: ReturnType<typeof useAnimeEditor> & {
  session: Session;
  close: () => void;
  created: (a: SavedAnimeSubscription) => void;
}) {
  return (
    <>
      <Button
        variant="ghost"
        onPress={() => setStep(selectedGroup ? "match" : "source")}
      >
        返回上一步
      </Button>
      <form
        className="management-stack"
        onSubmit={(e) => {
          e.preventDefault();
          void act(async () => {
            if (!draft.title.trim() || !draft.url.trim())
              throw new Error("请填写标题和 RSS 地址");
            if (!Number.isInteger(draft.season) || draft.season < 1)
              throw new Error("季数必须为正整数");
            if (session.mode === "live")
              created(await animeApi.create(draft, controller.current?.signal));
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
            min={1}
            max={100}
            label="季数"
            type="number"
            value={draft.season}
            onChange={(v) => change("season", Number(v))}
          />
          <Field
            min={-10000}
            max={10000}
            label="集数偏移"
            type="number"
            value={draft.offset}
            onChange={(v) => change("offset", Number(v))}
          />
          <Field
            min={0}
            max={10000}
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
            value={matchText}
            onChange={(e) => {
              setMatchText(e.target.value);
              change(
                "match",
                e.target.value
                  .split("\n")
                  .map((v) => v.trim())
                  .filter(Boolean),
              );
            }}
          />
        </label>
        <label className="management-field">
          排除正则（每行一个）
          <textarea
            rows={3}
            value={excludeText}
            onChange={(e) => {
              setExcludeText(e.target.value);
              change(
                "exclude",
                e.target.value
                  .split("\n")
                  .map((v) => v.trim())
                  .filter(Boolean),
              );
            }}
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
          isDisabled={draft.standby.length >= 5}
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
                setPreview(
                  await animeApi.preview(draft, controller.current?.signal),
                ),
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
                {r.accepted ? "✓" : "—"} {r.title} · 第 {r.episode ?? "?"} 集{" "}
                {r.reason} · {r.fileName}
              </p>
            ))}
          </div>
        )}
        <Button type="submit" isDisabled={busy}>
          {busy ? "正在处理…" : "保存订阅"}
        </Button>
      </form>
    </>
  );
}
