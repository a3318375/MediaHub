import { useAnimeEditor } from "../../hooks/useAnimeEditor";
import { AnimeBrowseStep } from "./AnimeBrowseStep";
import { AnimeEditStep } from "./AnimeEditStep";
import { AnimeMatchStep } from "./AnimeMatchStep";
import { AnimeSourceStep } from "./AnimeSourceStep";

import { Overlay } from "../../components/ui/Overlay";

import { type SavedAnimeSubscription } from "../../lib/anime-api";

import { type Session } from "../../lib/media-service";

import { Notice } from "../../components/ui/ManagementUI";

export function AnimeEditor({
  session,
  close,
  created,
}: {
  session: Session;
  close: () => void;
  created: (a: SavedAnimeSubscription) => void;
}) {
  const state = useAnimeEditor();
  const { step, busy, error, running } = state;
  return (
    <Overlay
      title="添加动漫订阅"
      onClose={() => {
        if (!running.current) close();
      }}
    >
      <div className="management-stack">
        <p role="status">
          {
            {
              source: "1 · 选择来源",
              browse: "2 · 选择番剧与字幕组",
              match: "3 · 选择匹配版本",
              edit: "4 · 确认订阅参数",
            }[step]
          }
        </p>
        <Notice error={error} />
        {busy && <p role="status">正在读取来源，请稍候…</p>}
        <fieldset disabled={busy} className="management-stack">
          {step === "source" && (
            <AnimeSourceStep
              {...state}
              session={session}
              close={close}
              created={created}
            />
          )}
          {step === "browse" && (
            <AnimeBrowseStep
              {...state}
              session={session}
              close={close}
              created={created}
            />
          )}
          {step === "match" && (
            <AnimeMatchStep
              {...state}
              session={session}
              close={close}
              created={created}
            />
          )}
          {step === "edit" && (
            <AnimeEditStep
              {...state}
              session={session}
              close={close}
              created={created}
            />
          )}
        </fieldset>
      </div>
    </Overlay>
  );
}
