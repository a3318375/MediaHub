import { Button } from "@heroui/react";
import { Field, SelectField } from "../../components/ui/ManagementUI";
import { useAnimeEditor } from "../../hooks/useAnimeEditor";
import {
  emptyAnimeDraft,
  type AnimeDraft,
  type SavedAnimeSubscription,
} from "../../lib/anime-api";
import { type Session } from "../../lib/media-service";
export function AnimeSourceStep({
  setSelectedGroup,
  setSelectedRule,
  draft,
  setDraft,
  setSeason,
  setSeasons,
  setCatalog,
  setGroups,
  setSelected,
  setPreview,
  change,
  resolve,
  browse,
}: ReturnType<typeof useAnimeEditor> & {
  session: Session;
  close: () => void;
  created: (a: SavedAnimeSubscription) => void;
}) {
  return (
    <>
      <SelectField
        label="订阅来源"
        value={draft.source}
        options={sources}
        onChange={(v) => {
          setDraft({ ...emptyAnimeDraft(), source: v as AnimeDraft["source"] });
          setSelectedGroup(null);
          setSelectedRule(-1);
          setPreview(null);
          setCatalog([]);
          setGroups([]);
          setSelected(null);
          setSeasons([]);
          setSeason("");
        }}
      />
      {draft.source === "other" && (
        <Field
          label="Bangumi ID"
          value={draft.bangumiId}
          onChange={(v) => change("bangumiId", v)}
          required
        />
      )}
      <Field
        label="主 RSS 地址"
        value={draft.url}
        onChange={(v) => change("url", v)}
      />
      <div className="management-actions">
        <Button
          variant="secondary"
          isDisabled={draft.source === "other"}
          onPress={() => void browse()}
        >
          浏览来源
        </Button>
        <Button
          isDisabled={
            !draft.url.trim() ||
            (draft.source === "other" && !draft.bangumiId.trim())
          }
          onPress={() => void resolve(draft)}
        >
          下一步
        </Button>
      </div>
    </>
  );
}

const sources = [
  ["mikan", "蜜柑计划"],
  ["ani-bt", "Ani-BT"],
  ["anime-garden", "Anime Garden"],
  ["other", "自定义 RSS"],
];
