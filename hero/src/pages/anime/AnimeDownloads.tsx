import { useEffect,useState } from "react";

import { Button } from "@heroui/react";


import { Overlay } from '../../components/ui/Overlay';

import {
type SavedAnimeSubscription
} from "../../lib/anime-api";

import {
directoryIdFromInput,
downloadApi,
type AnimeDownloadCandidate,
} from "../../lib/download-api";

import { read,save,type Session } from "../../lib/media-service";

import {
DirectoryField,
Field,
Notice,
Toggle
} from "../../components/ui/ManagementUI";


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
