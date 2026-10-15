import { useEffect, useState } from "react";

import { Button, Card, Chip } from "@heroui/react";

import { Overlay } from "../../components/ui/Overlay";

import {
  downloadApi,
  is115ShareURL,
  type DownloadTask,
} from "../../lib/download-api";

import { Field, Notice, SelectField } from "../../components/ui/ManagementUI";

import { Empty, errorText, time } from "../../components/media/MediaUI";

import { DownloadDialog } from "../../components/downloads/DownloadDialog";
import {
  save,
  service,
  type Download,
  type Session,
} from "../../lib/media-service";
export { DownloadDialog } from "../../components/downloads/DownloadDialog";

const states: Record<string, string> = {
  demo: "演示任务",
  queued: "排队中",
  submitted: "115 等待中",
  downloading: "下载中",
  awaiting_files: "确认文件中",
  unknown: "待核对",
  submitting: "提交中",
  running: "进行中",
  completed: "已完成",
  failed: "失败",
  cancelled: "已停止跟踪",
  waiting_credentials: "等待凭据",
  submission_unknown: "提交结果待核对",
  checking: "核对中",
  transferring: "转存中",
};

export function Downloads({
  recordsOnly = false,
  tasks,
  session,
  update,
  notify,
}: {
  recordsOnly?: boolean;
  tasks: Download[];
  session: Session;
  update: (items: Download[]) => void;
  notify: (s: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [detail, setDetail] = useState<DownloadTask | null>(null);
  const [manual, setManual] = useState(false);
  const [pending, setPending] = useState(false);
  const [url, setURL] = useState("");
  const [title, setTitle] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    async function load() {
      try {
        const items = await service(session).downloads();
        if (active) {
          update(items);
          setError("");
        }
      } catch (e) {
        if (active) setError(errorText(e));
      } finally {
        if (active) {
          setLoading(false);
          if (session.mode === "live") timer = setTimeout(load, 5000);
        }
      }
    }
    void load();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [session, revision]);
  async function action(
    task: DownloadTask,
    kind: "cancel" | "retry" | "resume",
  ) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      if (kind === "cancel") {
        const r = await downloadApi.cancel(task.id);
        notify(r.message);
      } else {
        await downloadApi[kind](task.id);
        notify(kind === "resume" ? "已恢复任务排队或跟踪" : "已重新排队");
      }
      setRevision((n) => n + 1);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  const visible = tasks.filter(
    (t) =>
      (filter === "all" || t.state === filter) &&
      (!query ||
        `${t.resourceId} ${(t as DownloadTask).references?.map((r) => r.media.title).join(" ") || ""}`
          .toLowerCase()
          .includes(query.toLowerCase())),
  );
  return (
    <section className="management-stack">
      <div className="media-section-heading">
        <h2>
          下载任务 <small>{tasks.length} 项</small>
        </h2>
        <div className="management-actions">
          <Button variant="secondary" onPress={() => setRevision((n) => n + 1)}>
            刷新状态
          </Button>
          {!recordsOnly && (
            <Button onPress={() => setManual(true)}>新建下载</Button>
          )}
        </div>
      </div>
      <div className="management-grid">
        <Field label="搜索任务" value={query} onChange={setQuery} />
        <SelectField
          label="任务状态"
          value={filter}
          options={[["all", "全部"], ...Object.entries(states)]}
          onChange={setFilter}
        />
      </div>
      <p className="media-note">
        显示最近 200 条任务。停止跟踪不会删除 115 任务或网盘文件；115
        已接受的下载可能继续。
      </p>
      <Notice error={error} />
      {!visible.length ? (
        <Empty>
          {loading
            ? "正在读取任务…"
            : error
              ? "任务暂不可用，请检查后端服务。"
              : "还没有符合条件的任务。"}
        </Empty>
      ) : (
        <div className="resource-grid">
          {visible.map((t) => {
            const task = t as DownloadTask;
            return (
              <Card key={t.id} className="resource-card">
                <div>
                  <Chip size="sm" variant="soft">
                    {states[t.state] || t.state}
                  </Chip>
                  <small>
                    {task.kind === "share_transfer" ? "分享转存" : "离线下载"}
                  </small>
                </div>
                <h3>
                  {task.references?.find((r) => r.media.title)?.media.title ||
                    t.resourceId ||
                    t.id}
                </h3>
                <progress aria-label="下载进度" max="100" value={t.progress} />
                <p>
                  {task.kind === "share_transfer" && task.state !== "completed"
                    ? "转存确认中"
                    : `${Math.round(t.progress)}%`}{" "}
                  · {time(t.createdAt)}
                </p>
                <small>
                  {task.references?.length || 0} 个来源 · 目录{" "}
                  {task.directoryId || "自动分类"}
                </small>
                {!!task.artifacts?.length && (
                  <details>
                    <summary>{task.artifacts.length} 个文件</summary>
                    {task.artifacts.map((f) => (
                      <p key={f.id}>{f.name}</p>
                    ))}
                  </details>
                )}
                {task.speed > 0 && (
                  <small>{(task.speed / 1024 / 1024).toFixed(1)} MB/s</small>
                )}
                <Notice error={t.error} />
                <div className="management-actions">
                  <Button
                    variant="secondary"
                    size="sm"
                    onPress={() => setDetail(task)}
                  >
                    查看详情
                  </Button>
                  {session.mode === "live" && (
                    <>
                      {(task.state === "cancelled" ||
                        (task.state === "failed" && !task.remoteId)) && (
                        <Button
                          size="sm"
                          isDisabled={busy}
                          variant="secondary"
                          onPress={() =>
                            void action(
                              task,
                              task.state === "cancelled" ? "resume" : "retry",
                            )
                          }
                        >
                          {task.state === "cancelled"
                            ? "恢复排队/跟踪"
                            : "重试排队"}
                        </Button>
                      )}
                      {!["completed", "failed", "cancelled"].includes(
                        task.state,
                      ) && (
                        <Button
                          size="sm"
                          variant="secondary"
                          isDisabled={busy}
                          onPress={() => void action(task, "cancel")}
                        >
                          {task.state === "queued" ? "取消排队" : "停止跟踪"}
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
      {detail && (
        <Overlay title="下载任务详情" onClose={() => setDetail(null)}>
          <div className="management-stack">
            <p>任务 ID：{detail.id}</p>
            <p>资源：{detail.resourceId}</p>
            <p>远程任务：{detail.remoteId || "—"}</p>
            <p>目标目录：{detail.directoryId || "自动分类"}</p>
            <p>
              状态：{states[detail.state] || detail.state} · {detail.progress}%
            </p>
            <p>更新：{time(detail.updatedAt || detail.createdAt)}</p>
            <Notice error={detail.error} />
            {detail.references?.map((r, i) => (
              <p key={i}>
                来源 {r.source} · {r.media.title} · 第 {r.media.season || "—"}{" "}
                季
              </p>
            ))}
            <h3>生成文件</h3>
            {detail.artifacts?.length ? (
              detail.artifacts.map((f) => (
                <p key={f.id}>
                  {f.name} · {(f.size / 1024 / 1024).toFixed(1)} MB · ID {f.id}
                </p>
              ))
            ) : (
              <p>暂无文件记录</p>
            )}
          </div>
        </Overlay>
      )}
      {manual && (
        <Overlay title="新建下载" onClose={() => setManual(false)}>
          <div className="management-stack">
            <Field label="作品标题" value={title} onChange={setTitle} />
            <Field label="磁力或 115 分享链接" value={url} onChange={setURL} />
            <Button
              isDisabled={
                !url.trim() ||
                (!url.startsWith("magnet:") && !is115ShareURL(url))
              }
              onPress={() => {
                setManual(false);
                setURL(url.trim());
                setTitle(title.trim() || "手动下载");
                setRevision((n) => n + 1);
                setPending(true);
              }}
            >
              下一步
            </Button>
          </div>
        </Overlay>
      )}
      {pending && (
        <DownloadDialog
          url={url}
          title={title}
          session={session}
          close={() => setPending(false)}
          created={(task) => {
            const next = [task, ...tasks.filter((t) => t.id !== task.id)];
            update(next);
            if (session.mode === "demo") save("mediahub.hero.downloads", next);
            notify("任务已提交");
          }}
        />
      )}
    </section>
  );
}
