import { useEffect, useState } from "react";

import { Button } from "@heroui/react";

import { Overlay } from "../../components/ui/Overlay";

import { type SavedAnimeSubscription } from "../../lib/anime-api";

import {
  downloadApi,
  type AnimeDownloadCandidate,
} from "../../lib/download-api";

import { read, save, type Session } from "../../lib/media-service";

import { Field, Notice, Toggle } from "../../components/ui/ManagementUI";

import { errorText } from "../../components/media/MediaUI";

export function AnimeDownloads({
  anime,
  session,
  close,
}: {
  anime: SavedAnimeSubscription;
  session: Session;
  close: () => void;
}) {
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
      setLoaded(true);
      setBusy(false);
      return;
    }
    downloadApi
      .getAnime(anime.id, c.signal)
      .then((r) => {
        if (!c.signal.aborted) {
          setRule(r.rule);
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
  const preview = items.length
    ? items
    : anime.resources
        .filter(
          (r) =>
            r.accepted && r.episode !== null && Number.isInteger(r.episode),
        )
        .map((r, i) => ({
          id: String(i),
          title: r.title,
          episode: r.episode as number,
          state: "pending",
          error: "",
        }));
  const inRange = preview.filter((i) => i.episode >= rule.fromEpisode);
  return (
    <Overlay
      title={`${anime.title} · 下载记录与范围`}
      onClose={() => {
        if (!busy) close();
      }}
    >
      <form
        className="management-stack"
        onSubmit={(e) => {
          e.preventDefault();
          void act(async () => {
            if (rule.fromEpisode < 1 || !Number.isInteger(rule.fromEpisode))
              throw new Error("起始集数必须为正整数");
            const value = {
              ...rule,
              directoryId: "library",
            };
            if (session.mode === "live")
              await downloadApi.saveAnime(anime.id, value);
            else save(`mediahub.hero.anime-download.${anime.id}`, value);
            close();
          });
        }}
      >
        <Notice error={error}>{notice}</Notice>
        <Toggle
          label="自动下载匹配的集数"
          checked={rule.enabled}
          onChange={(v) => setRule({ ...rule, enabled: v })}
        />
        <p className="media-note">
          使用设置中的统一下载目录，不需要为每部番剧单独填写目录。暂停订阅会停止产生新下载，已入队任务继续。
        </p>
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
              if (r.count === 0)
                setError(
                  "没有范围内可重试的资源，请先保存启用状态和下载范围。",
                );
              else setNotice(`已重新排队 ${r.count} 项`);
            })
          }
        >
          重试失败候选
        </Button>
        <p>
          {busy
            ? "正在读取候选…"
            : `当前范围内 ${inRange.length} 个资源候选；已入队资源不会重复提交。`}
        </p>
        {inRange.map((i) => (
          <div className="management-row" key={i.id}>
            <div>
              {i.title}
              <small>
                第 {i.episode} 集 ·{" "}
                {(
                  {
                    queued: "已入队",
                    failed: "解析失败",
                    resolving: "解析中",
                    retry: "待重试",
                  } as Record<string, string>
                )[i.state] || "待选择"}
                {i.error ? ` · ${i.error}` : ""}
              </small>
            </div>
          </div>
        ))}
        {!inRange.length && <p>尚无下载候选，订阅同步后自动生成。</p>}
      </form>
    </Overlay>
  );
}
