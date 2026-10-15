import { useEffect,useState } from "react";

import { Button,Card } from "@heroui/react";

import { Overlay } from "../../components/ui/Overlay";

import {
DirectoryField,
Field,
Notice,
SelectField,
Toggle,
} from "../../components/ui/ManagementUI";

import { Empty,errorText,time } from "../../components/media/MediaUI";

import {
organizeApi,
type OrganizePlan,
type OrganizeRule,
} from "../../lib/organize-api";

import {
directoryIdFromInput,
type DownloadFile,
type DownloadMediaContext,
} from "../../lib/download-api";

import { read,save,type Session } from "../../lib/media-service";
export { Logs } from "../logs/Logs";

const emptyRule: OrganizeRule = {
  id: "",
  name: "",
  sourceId: "",
  movieTargetId: "",
  tvTargetId: "",
  animeTargetId: "",
  programTargetId: "",
  dailyAt: "03:00",
  enabled: false,
  recursive: true,
  allowExisting: false,
  typeHint: "auto",
  keepQuality: true,
  keepSubgroup: false,
};

const directoryFields = [
  ["sourceId", "未整理目录"],
  ["movieTargetId", "电影目标目录"],
  ["tvTargetId", "剧集目标目录"],
  ["animeTargetId", "动漫目标目录"],
  ["programTargetId", "节目目标目录"],
] as const;

const states: Record<string, string> = {
  preview: "待执行",
  running: "执行中",
  paused: "已暂停",
  completed: "完成",
  completed_with_issues: "完成，有待处理文件",
  planned: "待整理",
  conflict: "冲突",
  renaming: "确认改名中",
  renamed: "已改名",
  moving: "确认移动中",
};

export function Organize({ session }: { session: Session }) {
  const [config, setConfig] = useState({
    id: "",
    sourceId: "",
    targetId: "",
    cron: "",
    enabled: false,
    scheduleError: "",
  });
  const [rules, setRules] = useState<OrganizeRule[]>([]);
  const [plans, setPlans] = useState<OrganizePlan[]>([]);
  const [rule, setRule] = useState({ ...emptyRule });
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [bindingFile, setBindingFile] = useState<DownloadFile | null>(null);
  const [binding, setBinding] = useState<DownloadMediaContext>({
    type: "movie",
    title: "",
  });
  const [ready, setReady] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const c = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function load() {
      try {
        if (session.mode === "demo") {
          setRules(read("mediahub.hero.organize.rules", []));
          setPlans([]);
        } else {
          const [r, p] = await Promise.all([
            organizeApi.rules(c.signal),
            organizeApi.plans(c.signal),
          ]);
          if (c.signal.aborted) return;
          setRules(r);
          setPlans(p);
        }
      } catch (e) {
        if (!c.signal.aborted) setError(errorText(e));
      } finally {
        if (!c.signal.aborted) {
          setLoading(false);
          if (session.mode === "live") timer = setTimeout(load, 5000);
        }
      }
    }
    void load();
    return () => {
      c.abort();
      clearTimeout(timer);
    };
  }, [session, revision]);
  useEffect(() => {
    const c = new AbortController();
    if (session.mode === "demo") {
      setConfig(
        read("mediahub.hero.organize.config", {
          id: "",
          sourceId: "",
          targetId: "",
          cron: "",
          enabled: false,
          scheduleError: "",
        }),
      );
      return;
    }
    organizeApi
      .config(c.signal)
      .then((r) => {
        if (!c.signal.aborted)
          setConfig({
            ...r,
            id: r.id || "",
            scheduleError: r.scheduleError || "",
          });
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(errorText(e));
      });
    return () => c.abort();
  }, [session]);
  async function act(fn: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
      setRevision((n) => n + 1);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  const plan = plans.find((p) => p.id === selected);
  return (
    <section className="management-stack">
      <Notice error={error}>{notice}</Notice>
      <Card className="management-card">
        <h2>媒体库与定时整理</h2>
        <form
          className="management-stack"
          onSubmit={(e) => {
            e.preventDefault();
            void act(async () => {
              const value = {
                ...config,
                sourceId: directoryIdFromInput(config.sourceId),
                targetId: directoryIdFromInput(config.targetId),
              };
              if (session.mode === "live") {
                const r = await organizeApi.saveConfig(value);
                setConfig({
                  ...r,
                  id: r.id,
                  scheduleError: r.scheduleError || "",
                });
                setNotice(
                  r.scheduleError
                    ? `目录已保存，定时任务未启用：${r.scheduleError}`
                    : r.enabled
                      ? "已保存并启用定时整理"
                      : "目录已保存，定时任务未启用",
                );
              } else {
                save("mediahub.hero.organize.config", value);
                setNotice("演示配置已保存，不会执行整理");
              }
            });
          }}
        >
          <div className="management-grid">
            <DirectoryField
              label="下载与未整理目录"
              value={config.sourceId}
              onChange={(v) => setConfig({ ...config, sourceId: v })}
              session={session}
            />
            <DirectoryField
              label="媒体库根目录"
              value={config.targetId}
              onChange={(v) => setConfig({ ...config, targetId: v })}
              session={session}
            />
          </div>
          <Field
            label="Cron（北京时间，留空停用）"
            value={config.cron}
            onChange={(v) => setConfig({ ...config, cron: v })}
            placeholder="0 3 * * *"
          />
          <p>
            保存有效 Cron 后启用定时整理。手动整理请先生成预览，再确认执行。
          </p>
          <Notice error={config.scheduleError} />
          <Button type="submit" isDisabled={busy || loading}>
            保存媒体库配置
          </Button>
          {config.id && (
            <Button
              variant="secondary"
              isDisabled={busy || session.mode === "demo"}
              onPress={() =>
                void act(async () => {
                  const p = await organizeApi.preview(config.id);
                  setPlans((old) => [p, ...old.filter((i) => i.id !== p.id)]);
                  setSelected(p.id);
                })
              }
            >
              预览媒体库整理
            </Button>
          )}
        </form>
      </Card>
      <div className="management-grid management-align-start">
        <Card className="management-card">
          <h2>{rule.id ? "编辑整理规则" : "新增整理规则"}</h2>
          <form
            className="management-stack"
            onSubmit={(e) => {
              e.preventDefault();
              void act(async () => {
                const normalized = { ...rule };
                for (const [key] of directoryFields)
                  normalized[key] = rule[key]
                    ? directoryIdFromInput(rule[key])
                    : "";
                const r =
                  session.mode === "live"
                    ? await organizeApi.save(normalized)
                    : { ...normalized, id: rule.id || crypto.randomUUID() };
                setRule(r);
                if (session.mode === "demo") {
                  const next = [r, ...rules.filter((i) => i.id !== r.id)];
                  setRules(next);
                  save("mediahub.hero.organize.rules", next);
                }
                setNotice("规则已保存，可先预览确认");
              });
            }}
          >
            <Field
              label="规则名称"
              value={rule.name}
              onChange={(v) => setRule({ ...rule, name: v })}
              required
            />
            {directoryFields.map(([key, label]) => (
              <DirectoryField
                key={key}
                label={label}
                value={rule[key]}
                onChange={(v) => setRule({ ...rule, [key]: v })}
                session={session}
              />
            ))}
            <Field
              label="每日运行时间（北京时间）"
              type="time"
              value={rule.dailyAt}
              onChange={(v) => setRule({ ...rule, dailyAt: v })}
            />
            <SelectField
              label="识别类型"
              value={rule.typeHint}
              options={[
                ["auto", "自动识别"],
                ["movie", "电影"],
                ["tv", "电视剧"],
                ["anime", "动漫"],
                ["program", "节目"],
              ]}
              onChange={(v) => setRule({ ...rule, typeHint: v })}
            />
            {(
              [
                ["enabled", "启用定时规则"],
                ["recursive", "包含子目录"],
                ["allowExisting", "允许合并已有目录"],
                ["keepQuality", "保留画质标签"],
                ["keepSubgroup", "保留字幕组"],
              ] as const
            ).map(([key, label]) => (
              <Toggle
                key={key}
                label={label}
                checked={rule[key]}
                onChange={(v) => setRule({ ...rule, [key]: v })}
              />
            ))}
            <div className="management-actions">
              <Button type="submit" isDisabled={busy || loading}>
                保存规则
              </Button>
              <Button
                variant="secondary"
                onPress={() => setRule({ ...emptyRule })}
              >
                新建规则
              </Button>
            </div>
          </form>
        </Card>
        <div className="management-stack">
          <Card className="management-card">
            <h2>已保存规则</h2>
            {!rules.length && (
              <Empty>{loading ? "正在加载…" : "尚无整理规则"}</Empty>
            )}
            {rules.map((r) => (
              <div className="management-row" key={r.id}>
                <div>
                  <strong>{r.name}</strong>
                  <small>{r.enabled ? `每天 ${r.dailyAt}` : "手动执行"}</small>
                </div>
                <div className="management-actions">
                  <Button variant="ghost" onPress={() => setRule(r)}>
                    编辑
                  </Button>
                  <Button
                    variant="secondary"
                    isDisabled={busy || session.mode === "demo"}
                    onPress={() =>
                      void act(async () => {
                        const p = await organizeApi.preview(r.id);
                        setPlans((old) => [
                          p,
                          ...old.filter((i) => i.id !== p.id),
                        ]);
                        setSelected(p.id);
                      })
                    }
                  >
                    预览
                  </Button>
                </div>
              </div>
            ))}
          </Card>
          <Card className="management-card">
            <h2>整理计划与执行记录</h2>
            <Button
              variant="secondary"
              onPress={() => setRevision((n) => n + 1)}
            >
              刷新记录
            </Button>
            {plans.map((p) => (
              <Button
                key={p.id}
                variant={selected === p.id ? "primary" : "ghost"}
                onPress={() => setSelected(p.id)}
              >
                {p.rule.name} · {states[p.state] || p.state} ·{" "}
                {time(p.createdAt)}
              </Button>
            ))}
            {!plans.length && <Empty>尚无整理计划</Empty>}
          </Card>
        </div>
      </div>
      {plan && (
        <Card className="management-card">
          <h2>
            {plan.rule.name} · {states[plan.state] || plan.state}
          </h2>
          <Notice error={plan.error} />
          <p>
            计划移动 {plan.actions.length} 个文件，{plan.issues.length}{" "}
            项待处理。
          </p>
          <Button
            isDisabled={busy || !["preview", "paused"].includes(plan.state)}
            onPress={() =>
              void act(async () => {
                const r = await organizeApi.start(plan.id);
                setPlans((old) => old.map((p) => (p.id === r.id ? r : p)));
                setNotice("整理计划已开始执行");
              })
            }
          >
            确认执行此计划
          </Button>
          {plan.actions.map((a) => (
            <div key={a.id} className="management-row">
              <div>
                <strong>{a.source.name}</strong>
                <small>
                  → {a.targetRootId}/{a.targetDirectories.join("/")}/
                  {a.targetName}
                </small>
                <small>
                  {states[a.state] || a.state} {a.error}
                </small>
              </div>
            </div>
          ))}
          {plan.issues.map((i, index) => (
            <div key={`${i.file.id}-${index}`} className="management-row">
              <div>
                <strong>{i.file.name}</strong>
                <small>
                  {i.code} · {i.message}
                </small>
              </div>
              <Button
                variant="secondary"
                onPress={() => {
                  setBindingFile(i.file);
                  setBinding({ type: "movie", title: "" });
                  setReady(false);
                }}
              >
                绑定作品
              </Button>
            </div>
          ))}
        </Card>
      )}
      {bindingFile && (
        <Overlay
          title={`绑定作品 · ${bindingFile.name}`}
          onClose={() => setBindingFile(null)}
        >
          <form
            className="management-stack"
            onSubmit={(e) => {
              e.preventDefault();
              void act(async () => {
                const { title, providerId, season, year } = binding;
                if (!title?.trim()) throw new Error("请填写作品名称");
                if (providerId && !/^\d+$/.test(providerId))
                  throw new Error("作品 ID 必须是数字");
                if (
                  season !== undefined &&
                  (!Number.isInteger(season) || season < 1)
                )
                  throw new Error("季数必须为正整数");
                if (year !== undefined && !Number.isInteger(year))
                  throw new Error("年份无效");
                await organizeApi.bind(bindingFile.id, binding, ready);
                setBindingFile(null);
                setNotice("作品已绑定，请重新生成预览");
              });
            }}
          >
            <Notice error={error} />
            <SelectField
              label="作品类型"
              value={binding.type || "movie"}
              options={[
                ["movie", "电影"],
                ["tv", "电视剧"],
                ["anime", "动漫"],
                ["program", "节目"],
              ]}
              onChange={(v) =>
                setBinding({
                  ...binding,
                  type: v as DownloadMediaContext["type"],
                })
              }
            />
            <Field
              label="作品名称"
              value={binding.title || ""}
              onChange={(v) => setBinding({ ...binding, title: v })}
              required
            />
            <Field
              label="年份"
              type="number"
              value={binding.year || ""}
              onChange={(v) =>
                setBinding({ ...binding, year: v ? Number(v) : undefined })
              }
            />
            <SelectField
              label="元数据来源"
              value={binding.provider || "tmdb"}
              options={[
                ["tmdb", "TMDB"],
                ["bangumi", "Bangumi"],
              ]}
              onChange={(v) => setBinding({ ...binding, provider: v })}
            />
            <Field
              label="作品 ID"
              value={binding.providerId || ""}
              onChange={(v) =>
                setBinding({
                  ...binding,
                  provider: binding.provider || "tmdb",
                  providerId: v,
                })
              }
            />
            <Field
              label="季数"
              type="number"
              value={binding.season || ""}
              onChange={(v) =>
                setBinding({ ...binding, season: v ? Number(v) : undefined })
              }
            />
            <Field
              label="集数（逗号分隔）"
              value={(binding.episodes || []).join(",")}
              onChange={(v) =>
                setBinding({
                  ...binding,
                  episodes: v
                    ? v
                        .split(/[,，\s]+/)
                        .filter(Boolean)
                        .map(Number)
                    : [],
                })
              }
            />
            <Toggle
              label="文件已完整，可整理"
              checked={ready}
              onChange={setReady}
            />
            <Button type="submit" isDisabled={busy}>
              保存作品绑定
            </Button>
          </form>
        </Overlay>
      )}
    </section>
  );
}
