import { Button } from "@heroui/react";
import { Empty } from "../../components/media/MediaUI";
import { Field, SelectField } from "../../components/ui/ManagementUI";
import { useAnimeEditor } from "../../hooks/useAnimeEditor";
import { type SavedAnimeSubscription } from "../../lib/anime-api";
import { type Session } from "../../lib/media-service";
export function AnimeBrowseStep({
  selectAnime,
  setStep,
  setSelectedGroup,
  setSelectedRule,
  draft,
  catalogPage,
  setCatalogPage,
  query,
  setQuery,
  season,
  setSeason,
  seasons,
  catalog,
  groups,
  setGroups,
  selected,
  setSelected,
  busy,
  browse,
  session,
}: ReturnType<typeof useAnimeEditor> & {
  session: Session;
  close: () => void;
  created: (a: SavedAnimeSubscription) => void;
}) {
  return (
    session.mode === "live" &&
    draft.source !== "other" && (
      <>
        {!selected && <form
          className="anime-browse-toolbar"
          onSubmit={(e) => {
            e.preventDefault();
            void browse();
          }}
        >
          <Field label="搜索番剧" value={query} onChange={setQuery} />
          <SelectField
            label="播出季度"
            value={season}
            options={[["", "全部"], ...Array.from(new Set(seasons)).map((s) => [s, s])]}
            onChange={setSeason}
          />
          <Button type="submit">查询</Button>
          <Button variant="secondary" onPress={() => void browse(true)}>
            刷新来源
          </Button>
        </form>}

        {!busy && !catalog.length && (
          <Empty>没有找到番剧，请查询或刷新来源。</Empty>
        )}
        {!selected && (
          <div className="anime-catalog-list">
            {catalog
              .slice((catalogPage - 1) * 20, catalogPage * 20)
              .map((i) => (
                <button
                  type="button"
                  className="anime-catalog-item"
                  aria-label={`查看 ${i.title}`}
                  key={i.id}
                  onClick={() => void selectAnime(i)}
                >
                  {i.poster && <img src={i.poster} alt="" loading="lazy" />}
                  <span>{i.title}</span>
                  <small>{i.week || "未知"}</small>
                </button>
              ))}
          </div>
        )}

        {!selected && catalog.length > 20 && (
          <div className="management-actions">
            <Button
              isDisabled={catalogPage <= 1}
              onPress={() => setCatalogPage((p) => p - 1)}
            >
              上一页
            </Button>
            <span>
              {catalogPage} / {Math.ceil(catalog.length / 20)}
            </span>
            <Button
              isDisabled={catalogPage * 20 >= catalog.length}
              onPress={() => setCatalogPage((p) => p + 1)}
            >
              下一页
            </Button>
          </div>
        )}
        {selected && <div className="anime-selection-heading"><h3>{selected.title}</h3><p>选择字幕组，下一步设置匹配版本</p></div>}
        {selected && !busy && !groups.length && (
          <Empty>没有找到字幕组，请返回选择其他番剧。</Empty>
        )}
        {groups.map((g) => (
          <div key={g.url} className="anime-group-card">
            <h4>{g.label}</h4>
            <details>
              <summary>查看发布记录（{g.items.length}）</summary>
              {g.items.map((item, i) => (
                <p key={i}>
                  {item.title}
                  <br />
                  {item.publishedAt}
                </p>
              ))}
            </details>
            <Button
              onPress={() => {
                setSelectedGroup(g);
                setSelectedRule(-1);
                setStep("match");
              }}
            >
              选择字幕组
            </Button>
          </div>
        ))}
        <div className="anime-step-actions">        <Button
          variant="secondary"
          onPress={() => {
            if (selected) {
              setSelected(null);
              setGroups([]);
            } else setStep("source");
          }}
        >
          返回{selected ? "番剧" : "来源"}
        </Button><span className="anime-step-hint">{selected ? `${groups.length} 个字幕组` : `${catalog.length} 部番剧`}</span></div>
      </>
    )
  );
}
