import { useEffect, useState } from "react";
import { Button, Card, Chip } from "@heroui/react";
import { Overlay } from "./App";
import {
  downloadApi,
  directoryIdFromInput,
  is115ShareURL,
  type DownloadFile,
  type DownloadMediaContext,
  type DownloadReference,
  type DownloadTask,
} from "./lib/download-api";
import {
  Field,
  DirectoryField,
  Notice,
  Toggle,
  SelectField,
} from "./ManagementUI";
import { Empty, errorText, time } from "./MediaUI";
import { save, service, type Download, type Session } from "./media-service";

export function DownloadDialog({
  url,
  title,
  password = "",
  media,
  reference,
  session,
  close,
  created,
}: {
  url: string;
  title: string;
  password?: string;
  media?: DownloadMediaContext;
  reference?: DownloadReference;
  session: Session;
  close: () => void;
  created: (d: Download) => void;
}) {
  const magnet = url.startsWith("magnet:");
  const [directory, setDirectory] = useState("");
  const [code, setCode] = useState(password);
  const [whole, setWhole] = useState(true);
  const [path, setPath] = useState([{ id: "", name: "分享根目录" }]);
  const [files, setFiles] = useState<DownloadFile[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  async function list(folder = path.at(-1)!.id) {
    setBusy(true);
    setError("");
    setSelected([]);
    setLoaded(false);
    try {
      const r = await downloadApi.shareFiles(url, code, folder);
      setFiles(r.items);
      setLoaded(true);
    } catch (e) {
      setError(errorText(e));
      setFiles([]);
    } finally {
      setBusy(false);
    }
  }
  async function submit() {
    setBusy(true);
    setError("");
    try {
      if (!magnet && !is115ShareURL(url))
        throw new Error("只支持 115 分享或磁力链接");
      if (!whole && !selected.length) throw new Error("请先选择要转存的文件");
      const directoryId = directory.trim()
        ? directoryIdFromInput(directory)
        : "";
      const task =
        session.mode === "demo"
          ? {
              id: crypto.randomUUID(),
              state: "demo",
              resourceId: title || url,
              progress: 0,
              createdAt: new Date().toISOString(),
            }
          : (
              await downloadApi.create({
                kind: magnet ? "offline" : "share_transfer",
                url,
                directoryId,
                reference: reference || {
                  source: "media_search",
                  media: media || { title },
                },
                ...(!magnet
                  ? {
                      wholeShare: whole,
                      receiveCode: code.trim(),
                      ...(!whole
                        ? {
                            sourceDirectoryId: path.at(-1)!.id,
                            fileIds: selected,
                          }
                        : {}),
                    }
                  : {}),
              })
            ).task;
      created(task);
      close();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Overlay title={magnet ? "115 离线下载" : "115 分享转存"} onClose={close}>
      <form
        className="management-stack"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <fieldset disabled={busy} className="management-stack">
          <p>{title}</p>
          <p className="media-note">
            {session.mode === "demo"
              ? "仅创建本地演示任务，不会下载。"
              : "确认后提交到已配置的 115 账号。目标目录留空时按媒体库配置自动分类。"}
          </p>
          <Notice error={error} />
          <DirectoryField
            label="目标文件夹（可留空）"
            value={directory}
            onChange={setDirectory}
            session={session}
          />
          {!magnet && (
            <>
              <Field
                label="提取码"
                value={code}
                onChange={(v) => {
                  setCode(v);
                  setLoaded(false);
                  setSelected([]);
                }}
              />
              <Toggle
                label="转存整份分享"
                checked={whole}
                onChange={setWhole}
              />
              {!whole && (
                <div className="management-stack">
                  <p>{path.map((p) => p.name).join(" / ")}</p>
                  <div className="management-actions">
                    <Button
                      variant="secondary"
                      isDisabled={busy || session.mode === "demo"}
                      onPress={() => void list()}
                    >
                      读取分享文件
                    </Button>
                    <Button
                      variant="secondary"
                      isDisabled={busy || path.length === 1}
                      onPress={() => {
                        const next = path.slice(0, -1);
                        setPath(next);
                        void list(next.at(-1)!.id);
                      }}
                    >
                      上一级
                    </Button>
                  </div>
                  {loaded && (
                    <Toggle
                      label="选择当前目录全部文件"
                      checked={
                        files.length > 0 && selected.length === files.length
                      }
                      onChange={(v) =>
                        setSelected(v ? files.map((f) => f.id) : [])
                      }
                    />
                  )}{" "}
                  {files.map((f) => (
                    <div key={f.id} className="management-row">
                      <Toggle
                        label={`${f.directory ? "文件夹" : "文件"} · ${f.name}`}
                        checked={selected.includes(f.id)}
                        onChange={(v) =>
                          setSelected((old) =>
                            v ? [...old, f.id] : old.filter((i) => i !== f.id),
                          )
                        }
                      />
                      {f.directory && (
                        <Button
                          variant="ghost"
                          isDisabled={busy}
                          onPress={() => {
                            setPath((p) => [...p, { id: f.id, name: f.name }]);
                            void list(f.id);
                          }}
                        >
                          进入
                        </Button>
                      )}
                    </div>
                  ))}
                  {loaded && !files.length && <Empty>此分享目录为空</Empty>}
                </div>
              )}
            </>
          )}
          <Button
            type="submit"
            isDisabled={
              busy || (!magnet && !whole && (!loaded || !selected.length))
            }
          >
            {busy ? "正在处理…" : "确认提交"}
          </Button>
        </fieldset>
      </form>
    </Overlay>
  );
}
const states: Record<string, string> = {
  demo: "演示任务",
  queued: "排队中",
  submitting: "提交中",
  running: "进行中",
  completed: "已完成",
  failed: "失败",
  cancelled: "已取消",
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
        if (active && session.mode === "live") timer = setTimeout(load, 5000);
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
      <Notice error={error} />
      {!visible.length ? (
        <Empty>还没有符合条件的任务。</Empty>
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
                  {Math.round(t.progress)}% · {time(t.createdAt)}
                </p>
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
