import { useState } from "react";

import { Button } from "@heroui/react";

import { Overlay } from '../ui/Overlay';

import {
directoryIdFromInput,
downloadApi,
is115ShareURL,
type DownloadFile,
type DownloadMediaContext,
type DownloadReference
} from "../../lib/download-api";

import {
DirectoryField,
Field,
Notice,
Toggle
} from "../ui/ManagementUI";

import { Empty,errorText } from "../media/MediaUI";

import { type Download,type Session } from "../../lib/media-service";


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
