import { Button } from "@heroui/react";
import { useAnimeEditor } from "../../hooks/useAnimeEditor";
import { type SavedAnimeSubscription } from "../../lib/anime-api";
import { type Session } from "../../lib/media-service";
export function AnimeMatchStep({
  setStep,
  selectedGroup,
  selectedRule,
  setSelectedRule,
  draft,
  selected,
  resolve,
}: ReturnType<typeof useAnimeEditor> & {
  session: Session;
  close: () => void;
  created: (a: SavedAnimeSubscription) => void;
}) {
  return (
    selectedGroup && (
      <div className="management-stack">
        <h3>
          {selected?.title} · {selectedGroup.label}
        </h3>
        <p>
          所选组合的全部条件都需要命中；全部表示不增加匹配条件，排除规则仍然生效。
        </p>
        {[[], ...(selectedGroup.groupRegex?.regexList || [])].map(
          (rules, i) => (
            <label className={`anime-rule-card ${selectedRule === i - 1 ? "is-selected" : ""}`} key={i}>
              <input
                type="radio"
                name="anime-rule"
                checked={selectedRule === i - 1}
                onChange={() => setSelectedRule(i - 1)}
              />
              <span className="anime-rule-tags">{rules.length
                ? rules.map((r) => (
                    <span className="anime-rule-tag" key={r.regex} title={r.regex}>
                      {r.label}
                    </span>
                  ))
                : "全部版本"}</span>
            </label>
          ),
        )}
        <div className="anime-step-actions">
          <Button variant="secondary" onPress={() => setStep("browse")}>
            返回字幕组
          </Button>
          <Button
            onPress={() =>
              void resolve({
                ...draft,
                url: selectedGroup.url,
                subgroup: selectedGroup.label,
                bangumiId: selectedGroup.bangumiId,
                week:
                  [
                    "星期一",
                    "星期二",
                    "星期三",
                    "星期四",
                    "星期五",
                    "星期六",
                    "星期日",
                  ].indexOf(selected?.week || "") + 1,
                match:
                  selectedRule < 0
                    ? []
                    : selectedGroup.groupRegex.regexList[selectedRule].map(
                        (r) => r.regex,
                      ),
              })
            }
          >
            下一步
          </Button>
        </div>
      </div>
    )
  );
}
