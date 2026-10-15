import { useState,type FormEvent } from "react";

import { Button,Input } from "@heroui/react";



import { Overlay } from '../../components/ui/Overlay';

import { type TV,type TVDraft } from "../../lib/media-service";

import { errorText,FilterTabs } from "../../components/media/MediaUI";

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
