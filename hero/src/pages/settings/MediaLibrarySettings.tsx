import { Button, Card } from "@heroui/react";
import { useEffect, useState } from "react";
import { errorText, time } from "../../components/media/MediaUI";
import {
  DirectoryField,
  Field,
  Notice,
} from "../../components/ui/ManagementUI";
import { directoryIdFromInput } from "../../lib/download-api";
import {
  read,
  save,
  type Download,
  type Session,
} from "../../lib/media-service";
import { organizeApi, type OrganizePlan } from "../../lib/organize-api";
import { Downloads } from "../downloads/Downloads";

// Mirrors the active MediaLibrarySettings flow, not the retired OrganizePage.
export function MediaLibrarySettings({ session }: { session: Session }) {
  const [config, setConfig] = useState({
    id: "",
    sourceId: "",
    targetId: "",
    cron: "",
    enabled: false,
    scheduleError: "",
  });
  const [plans, setPlans] = useState<OrganizePlan[]>([]);
  const [selected, setSelected] = useState("");
  const [tasks, setTasks] = useState<Download[]>(() =>
    session.mode === "demo" ? read("mediahub.hero.downloads", []) : [],
  );
  const [records, setRecords] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => {
    const c = new AbortController();
    if (session.mode === "demo") {
      setConfig(read("mediahub.hero.organize.config", config));
      setLoaded(true);
      return;
    }
    organizeApi
      .config(c.signal)
      .then((r) => {
        if (!c.signal.aborted) {
          setConfig({
            ...r,
            id: r.id || "",
            scheduleError: r.scheduleError || "",
          });
          setLoaded(true);
        }
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(errorText(e));
      });
    return () => c.abort();
  }, [session]);
  useEffect(() => {
    const c = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function load() {
      if (session.mode === "demo") return;
      try {
        const p = await organizeApi.plans(c.signal);
        if (!c.signal.aborted) setPlans(p);
      } catch (e) {
        if (!c.signal.aborted) setError(errorText(e));
      } finally {
        if (!c.signal.aborted) timer = setTimeout(load, 5000);
      }
    }
    void load();
    return () => {
      c.abort();
      clearTimeout(timer);
    };
  }, [session]);
  async function act(fn: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  const plan = plans.find((p) => p.id === selected);
  async function start(p: OrganizePlan) {
    await act(async () => {
      const r = await organizeApi.start(p.id);
      setPlans((old) => old.map((v) => (v.id === r.id ? r : v)));
      setNotice(
        p.state === "paused"
          ? "已恢复，将先核对文件实际状态。"
          : "已加入整理队列。",
      );
    });
  }
  return (
    <div className="management-stack">
      <Card className="management-card">
        <Notice error={error}>{notice}</Notice>
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
              if (session.mode === "demo") {
                save("mediahub.hero.organize.config", value);
                setNotice("演示目录已保存，不执行文件整理。");
                return;
              }
              const r = await organizeApi.saveConfig(value);
              setConfig({
                ...r,
                id: r.id,
                scheduleError: r.scheduleError || "",
              });
              setSelected("");
              setNotice(
                r.enabled
                  ? "已保存，Cron 有效，定时整理已启用。"
                  : r.scheduleError
                    ? `目录已保存，Cron 无效，定时整理已停用：${r.scheduleError}`
                    : "目录已保存，未填写 Cron，定时整理已停用。",
              );
            });
          }}
        >
          <DirectoryField
            session={session}
            label="未整理目录"
            value={config.sourceId}
            onChange={(v) => setConfig({ ...config, sourceId: v })}
          />
          <p className="media-note">下载时自动创建动漫、电影等分类目录。</p>
          <DirectoryField
            session={session}
            label="已整理目录"
            value={config.targetId}
            onChange={(v) => setConfig({ ...config, targetId: v })}
          />
          <p className="media-note">
            归档到媒体库，电影和剧集按作品及季集命名。
          </p>
          <Field
            label="Cron 表达式"
            value={config.cron}
            onChange={(v) => setConfig({ ...config, cron: v })}
            placeholder="例如 0 3 * * *"
          />
          <p className="media-note">
            使用 5 段格式：分钟 小时 日 月 星期，按北京时间执行。例如 0 3 * * *
            表示每天 03:00；*/30 * * * * 表示每 30
            分钟。留空或填写错误不启用定时；有效表达式保存后自动启用。
          </p>
          <p className="media-note">
            已保存的定时状态：{config.enabled ? "已启用" : "未启用"}
          </p>
          <Notice error={config.scheduleError} />
          <div className="management-actions">
            <Button type="submit" isDisabled={busy || !loaded}>
              保存
            </Button>
            <Button
              variant="secondary"
              isDisabled={
                busy || !loaded || !config.id || session.mode === "demo"
              }
              onPress={() =>
                void act(async () => {
                  const p = await organizeApi.preview(config.id);
                  setPlans((old) => [p, ...old.filter((i) => i.id !== p.id)]);
                  setSelected(p.id);
                })
              }
            >
              查看整理预览
            </Button>
          </div>
        </form>
        {plans
          .filter((p) => p.mode === "scheduled")
          .slice(0, 3)
          .map((p) => (
            <div className="management-row" key={p.id}>
              <div>
                {time(p.createdAt)} · {p.state} · 已整理{" "}
                {p.actions.filter((a) => a.state === "completed").length}/
                {p.actions.length} 个文件
                <Notice error={p.error} />
              </div>
              <Button
                variant="secondary"
                size="sm"
                onPress={() => setSelected(p.id)}
              >
                查看详情
              </Button>
              {p.state === "paused" && (
                <Button
                  isDisabled={busy}
                  variant="secondary"
                  onPress={() => void start(p)}
                >
                  核对后恢复
                </Button>
              )}
            </div>
          ))}
        {plan && (
          <section className="management-stack">
            <p>
              {plan.actions.length} 个文件可整理，{plan.issues.length}{" "}
              个文件需要确认。作品或季集不明确时保留原文件；同名目标不会覆盖。
            </p>
            {plan.actions.slice(0, 30).map((a) => (
              <p key={a.id}>
                {a.source.name} → {a.targetDirectories.join("/")}/{a.targetName}
                {a.error ? `（${a.error}）` : ""}
              </p>
            ))}
            {plan.issues.slice(0, 30).map((i) => (
              <p key={i.file.id}>
                {i.file.name}：{i.message}
              </p>
            ))}
            <Button
              isDisabled={busy || plan.state !== "preview"}
              onPress={() => void start(plan)}
            >
              整理这些文件
            </Button>
          </section>
        )}
        <p className="media-note">
          这里只归档和重命名。NFO、图片及 Emby 刮削暂不在此配置。
        </p>
        <details onToggle={(e) => setRecords(e.currentTarget.open)}>
          <summary>下载记录与异常处理</summary>
          {records && (
            <Downloads
              session={session}
              tasks={tasks}
              update={setTasks}
              notify={setNotice}
              recordsOnly
            />
          )}
        </details>
      </Card>
    </div>
  );
}
