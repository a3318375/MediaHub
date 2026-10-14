import { useRef, useState, useEffect } from "react"
import { CheckCircle2Icon, FolderIcon, LoaderCircleIcon } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldDescription,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  downloadApi,
  is115ShareURL,
  type DownloadFile,
  type DownloadMediaContext,
  type DownloadTask,
} from "@/lib/download-api"

export type DownloadSource = {
  url: string
  password?: string
  title: string
  media?: DownloadMediaContext
}
export function ResourceDownloadDialog({
  source,
  media,
  onClose,
  onCreated,
}: {
  source: DownloadSource
  media?: DownloadMediaContext
  onClose: () => void
  onCreated: () => void
  initialDirectory?: string
}) {
  const sharing = is115ShareURL(source.url)
  const [password, setPassword] = useState(source.password ?? "")
  const [files, setFiles] = useState<DownloadFile[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [folder, setFolder] = useState("0")
  const [parents, setParents] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [task, setTask] = useState<DownloadTask | null>(null)
  const [trackingError, setTrackingError] = useState("")
  const [error, setError] = useState("")
  const controller = useRef<AbortController | null>(null)
  useEffect(() => () => controller.current?.abort(), [])
  const tracking =
    sharing &&
    task !== null &&
    !["completed", "failed", "cancelled"].includes(task.state)
  const taskId = task?.id
  useEffect(() => {
    if (!tracking || !taskId) return
    const abort = new AbortController()
    let timer: number | undefined
    async function refresh() {
      try {
        const result = await downloadApi.list(abort.signal)
        if (abort.signal.aborted) return
        const latest = result.items.find((item) => item.id === taskId)
        if (latest) setTask(latest)
        setTrackingError(latest ? "" : "暂未找到任务记录，请到下载记录查看。")
      } catch (reason) {
        if (!abort.signal.aborted)
          setTrackingError(
            reason instanceof Error ? reason.message : "读取转存进度失败"
          )
      } finally {
        if (!abort.signal.aborted)
          timer = window.setTimeout(() => void refresh(), 2000)
      }
    }
    void refresh()
    return () => {
      abort.abort()
      if (timer !== undefined) window.clearTimeout(timer)
    }
  }, [tracking, taskId])

  async function browse(id: string, stack: string[]) {
    controller.current?.abort()
    const next = new AbortController()
    controller.current = next
    setBusy(true)
    setError("")
    try {
      const result = await downloadApi.shareFiles(
        source.url,
        password.trim(),
        id,
        next.signal
      )
      if (!next.signal.aborted) {
        setFiles(result.items)
        setFolder(id)
        setParents(stack)
        setSelected([])
      }
    } catch (reason) {
      if (!next.signal.aborted)
        setError(reason instanceof Error ? reason.message : "读取分享失败")
    } finally {
      if (!next.signal.aborted) setBusy(false)
    }
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (busy || task) return
    setBusy(true)
    setSubmitting(true)
    setError("")
    const context = media ?? source.media
    try {
      const result = await downloadApi.create({
        kind: sharing ? "share_transfer" : "offline",
        url: source.url,
        directoryId: "",
        reference: {
          source: "media_search",
          sourceId: context?.providerId
            ? `${context.provider}:${context.type ?? "unknown"}:${context.providerId}`
            : undefined,
          media: {
            ...context,
            type: context?.type ?? "movie",
            title: context?.title ?? source.title,
          },
        },
        ...(sharing
          ? {
              receiveCode: password.trim(),
              sourceDirectoryId: folder,
              fileIds: selected,
            }
          : {}),
      })
      onCreated()
      setTask(result.task)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "下载提交失败")
    } finally {
      setBusy(false)
      setSubmitting(false)
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose()
      }}
    >
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {sharing ? "转存 115 分享" : "提交 115 离线下载"}
          </DialogTitle>
          <DialogDescription>
            {source.title}。自动使用设置中的未整理目录，下载完成后统一归档。
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(event) => void submit(event)}
          className="flex min-h-0 flex-col gap-4"
        >
          {error && (
            <Alert variant="destructive" role="alert">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {(busy || task) && (
            <Alert
              variant={task?.state === "failed" ? "destructive" : "default"}
              role="status"
              aria-live="polite"
            >
              {task?.state === "completed" ? (
                <CheckCircle2Icon />
              ) : busy || tracking ? (
                <LoaderCircleIcon className="animate-spin" />
              ) : null}
              <AlertDescription>
                {busy
                  ? submitting
                    ? "正在提交任务，请稍候…"
                    : "正在读取分享目录，请稍候…"
                  : task?.state === "completed"
                    ? "转存成功，文件已确认，后续整理将按设置执行。"
                    : task?.state === "failed"
                      ? `转存失败：${task.error || "请到下载记录查看并重试。"}`
                      : task?.state === "cancelled"
                        ? "已停止跟踪此任务。"
                        : task?.state === "unknown"
                          ? `正在核对转存结果，请勿重复提交。${task.error || ""}`
                          : task?.state === "awaiting_files"
                            ? "115 已接收转存请求，正在确认目标目录中的文件…"
                            : sharing
                              ? "任务已入队，正在等待或执行转存。关闭弹窗后可在下载记录查看结果。"
                              : "已加入下载队列，可在下载记录查看后续进度。"}
              </AlertDescription>
            </Alert>
          )}
          {trackingError && (
            <Alert variant="destructive" role="alert">
              <AlertDescription>
                进度更新失败：{trackingError}
                。任务仍可能继续执行，请勿重复提交。
              </AlertDescription>
            </Alert>
          )}
          <fieldset disabled={task !== null} className="contents">
            <FieldGroup>
              <FieldDescription>
                目标目录由设置统一管理；分享转存后会确认文件，再进入整理。
              </FieldDescription>
              {sharing && (
                <Field>
                  <FieldLabel htmlFor="share-receive-code">提取码</FieldLabel>
                  <Input
                    id="share-receive-code"
                    value={password}
                    onChange={(event) => {
                      setPassword(event.target.value)
                      setFiles([])
                      setSelected([])
                      setFolder("0")
                      setParents([])
                    }}
                    maxLength={32}
                    disabled={busy}
                  />
                </Field>
              )}
            </FieldGroup>
            {sharing && (
              <>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void browse("0", [])}
                    disabled={busy}
                  >
                    读取分享根目录
                  </Button>
                  {parents.length > 0 && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() =>
                        void browse(
                          parents[parents.length - 1],
                          parents.slice(0, -1)
                        )
                      }
                      disabled={busy}
                    >
                      返回上层
                    </Button>
                  )}
                  <span className="text-xs text-muted-foreground">
                    已选择 {selected.length} 项（最多 100 项）
                  </span>
                </div>
                <div className="max-h-64 overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>选择</TableHead>
                        <TableHead>文件或目录</TableHead>
                        <TableHead>大小</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {files.map((file) => (
                        <TableRow key={file.id}>
                          <TableCell>
                            <Checkbox
                              aria-label={`选择 ${file.name}`}
                              checked={selected.includes(file.id)}
                              disabled={
                                busy ||
                                (!selected.includes(file.id) &&
                                  selected.length >= 100)
                              }
                              onCheckedChange={(checked) =>
                                setSelected((current) =>
                                  checked
                                    ? [...current, file.id]
                                    : current.filter((id) => id !== file.id)
                                )
                              }
                            />
                          </TableCell>
                          <TableCell>
                            {file.directory ? (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                disabled={busy}
                                onClick={() =>
                                  void browse(file.id, [...parents, folder])
                                }
                              >
                                <FolderIcon data-icon="inline-start" />
                                {file.name}
                              </Button>
                            ) : (
                              file.name
                            )}
                          </TableCell>
                          <TableCell>
                            {file.directory
                              ? "目录"
                              : `${(file.size / 1024 / 1024).toFixed(1)} MB`}
                          </TableCell>
                        </TableRow>
                      ))}
                      {!files.length && (
                        <TableRow>
                          <TableCell colSpan={3}>
                            {busy && !submitting
                              ? "正在读取…"
                              : "读取分享后，选择要转存的文件。"}
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}
          </fieldset>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={onClose}
            >
              {task ? "关闭" : "取消"}
            </Button>
            <Button
              type="submit"
              disabled={busy || task !== null || (sharing && !selected.length)}
            >
              {submitting && (
                <LoaderCircleIcon
                  className="animate-spin"
                  data-icon="inline-start"
                />
              )}
              {submitting
                ? "正在提交…"
                : task
                  ? "任务已提交"
                  : sharing
                    ? "确认选择并转存"
                    : "加入下载队列"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
