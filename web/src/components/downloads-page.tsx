import { useEffect, useState } from "react"
import {
  ResourceDownloadDialog,
  type DownloadSource,
} from "@/components/resource-download-dialog"
import { DownloadIcon, RefreshCwIcon } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card"
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
  directoryIdFromInput,
  type DownloadTask,
} from "@/lib/download-api"

const states: Record<string, string> = {
  queued: "排队中",
  submitting: "提交中",
  submitted: "115 等待中",
  downloading: "下载中",
  awaiting_files: "确认文件中",
  completed: "下载完成",
  failed: "下载失败",
  unknown: "待核对",
  cancelled: "已停止跟踪",
}
function active(task: DownloadTask) {
  return !["completed", "failed", "cancelled"].includes(task.state)
}
function reasonMessage(reason: unknown) {
  return reason instanceof Error ? reason.message : "下载请求失败"
}

export function DownloadsPage({
  recordsOnly = false,
}: {
  recordsOnly?: boolean
}) {
  const [tasks, setTasks] = useState<DownloadTask[]>([])
  const [magnet, setMagnet] = useState("")
  const [directory, setDirectory] = useState("")
  const [title, setTitle] = useState("")
  const [loadError, setLoadError] = useState("")
  const [actionError, setActionError] = useState("")
  const [notice, setNotice] = useState("")
  const [busy, setBusy] = useState("")
  const [loading, setLoading] = useState(true)
  const [revision, setRevision] = useState(0)
  const [shareSource, setShareSource] = useState<DownloadSource | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    let timer: number | undefined
    async function load() {
      try {
        const result = await downloadApi.list(controller.signal)
        if (!controller.signal.aborted) {
          setTasks(result.items)
          setLoadError("")
        }
      } catch (reason) {
        if (!controller.signal.aborted) setLoadError(reasonMessage(reason))
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false)
          timer = window.setTimeout(() => void load(), 5000)
        }
      }
    }
    void load()
    return () => {
      controller.abort()
      if (timer !== undefined) window.clearTimeout(timer)
    }
  }, [revision])

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (busy) return
    if (is115ShareURL(magnet.trim())) {
      setShareSource({ url: magnet.trim(), title: title.trim() || "115 分享" })
      return
    }
    setActionError("")
    setNotice("")
    setBusy("submit")
    try {
      const result = await downloadApi.create({
        kind: "offline",
        url: magnet.trim(),
        directoryId: directoryIdFromInput(directory),
        reference: { source: "manual", media: { title: title.trim() } },
      })
      setNotice(
        result.created
          ? "已加入 115 下载队列。"
          : "此资源已有任务，已关联到现有记录。"
      )
      setMagnet("")
      setRevision((value) => value + 1)
    } catch (reason) {
      setActionError(reasonMessage(reason))
    } finally {
      setBusy("")
    }
  }
  async function cancel(task: DownloadTask) {
    if (busy) return
    setBusy(task.id)
    setActionError("")
    setNotice("")
    try {
      const result = await downloadApi.cancel(task.id)
      setNotice(result.message)
      setRevision((value) => value + 1)
    } catch (reason) {
      setActionError(reasonMessage(reason))
    } finally {
      setBusy("")
    }
  }

  async function recover(task: DownloadTask) {
    if (busy) return
    setBusy(task.id)
    setActionError("")
    setNotice("")
    try {
      if (task.state === "cancelled") {
        await downloadApi.resume(task.id)
        setNotice("已恢复排队或任务核对；不确定的提交不会自动重发。")
      } else {
        await downloadApi.retry(task.id)
        setNotice("已重新加入排队。")
      }
      setRevision((value) => value + 1)
    } catch (reason) {
      setActionError(reasonMessage(reason))
    } finally {
      setBusy("")
    }
  }

  return (
    <div className="flex flex-col gap-5 p-4 sm:p-6 lg:p-7">
      {shareSource && (
        <ResourceDownloadDialog
          source={shareSource}
          initialDirectory={directory}
          onClose={() => setShareSource(null)}
          onCreated={() => {
            setMagnet("")
            setRevision((value) => value + 1)
            setNotice("已加入转存队列。")
          }}
        />
      )}
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          查看 115 离线任务及已确认的文件。
        </p>
        <Button
          variant="outline"
          onClick={() => setRevision((value) => value + 1)}
        >
          <RefreshCwIcon data-icon="inline-start" />
          刷新
        </Button>
      </div>
      {(actionError || loadError) && (
        <Alert variant="destructive">
          <AlertTitle>操作未完成</AlertTitle>
          <AlertDescription>{actionError || loadError}</AlertDescription>
        </Alert>
      )}
      {notice && (
        <Alert>
          <AlertTitle>任务更新</AlertTitle>
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}
      {!recordsOnly && (
        <Card>
          <CardHeader>
            <CardTitle>添加 115 下载或转存</CardTitle>
            <CardDescription>
              先在全局设置中保存 115 Cookie，再选择下载目标文件夹。
            </CardDescription>
          </CardHeader>
          <form onSubmit={(event) => void submit(event)}>
            <CardContent>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="download-magnet">
                    磁力或 115 分享链接
                  </FieldLabel>
                  <Input
                    id="download-magnet"
                    value={magnet}
                    onChange={(event) => setMagnet(event.target.value)}
                    required
                    placeholder="magnet:?xt=urn:btih:…"
                    disabled={Boolean(busy)}
                  />
                  <FieldDescription>
                    支持 BT v1 磁力；115 分享会先打开文件选择窗口。
                  </FieldDescription>
                </Field>
                <Field>
                  <FieldLabel htmlFor="download-directory">
                    115 目标文件夹
                  </FieldLabel>
                  <Input
                    id="download-directory"
                    value={directory}
                    onChange={(event) => setDirectory(event.target.value)}
                    required
                    placeholder="粘贴 115 文件夹链接，或文件夹 ID"
                    disabled={Boolean(busy)}
                  />
                  <FieldDescription>
                    打开 115 中的目标文件夹，复制包含 cid
                    的地址。文件先保留原名，公共整理后续接入。
                  </FieldDescription>
                </Field>
                <Field>
                  <FieldLabel htmlFor="download-title">名称（可选）</FieldLabel>
                  <Input
                    id="download-title"
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    maxLength={200}
                    disabled={Boolean(busy)}
                  />
                </Field>
              </FieldGroup>
            </CardContent>
            <CardFooter className="pt-4">
              <Button
                type="submit"
                disabled={Boolean(busy) || !magnet.trim() || !directory.trim()}
              >
                <DownloadIcon data-icon="inline-start" />
                {busy === "submit" ? "正在提交…" : "加入下载队列"}
              </Button>
            </CardFooter>
          </form>
        </Card>
      )}
      <Card>
        <CardHeader>
          <CardTitle>下载任务</CardTitle>
          <CardDescription>
            显示最近 200 条任务。停止跟踪不会删除 115 任务或网盘文件；115
            已接受的下载可能继续。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>资源</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>下载进度</TableHead>
                <TableHead>文件</TableHead>
                <TableHead>操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tasks.map((task) => (
                <TableRow key={task.id}>
                  <TableCell>
                    <div className="flex max-w-80 flex-col gap-1">
                      <span className="truncate">
                        {task.references.find((r) => r.media.title)?.media
                          .title || task.resourceId}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {task.references.length} 个来源 · 目录{" "}
                        {task.directoryId}
                      </span>
                      {task.error && (
                        <span className="text-xs text-destructive">
                          {task.error}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        task.state === "failed" ? "destructive" : "secondary"
                      }
                    >
                      {states[task.state] ?? task.state}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <span>
                        {task.kind === "share_transfer" &&
                        task.state !== "completed"
                          ? "转存确认中"
                          : `${Math.round(task.progress)}%`}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {task.speed > 0
                          ? `${(task.speed / 1024 / 1024).toFixed(1)} MB/s`
                          : "—"}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    {task.artifacts.length ? (
                      <details>
                        <summary>{task.artifacts.length} 个文件</summary>
                        <ul className="mt-2 flex max-w-72 flex-col gap-1">
                          {task.artifacts.map((file) => (
                            <li key={file.id} className="text-xs break-all">
                              {file.name}
                            </li>
                          ))}
                        </ul>
                      </details>
                    ) : (
                      "待确认"
                    )}
                  </TableCell>
                  <TableCell>
                    {(task.state === "cancelled" ||
                      (task.state === "failed" && !task.remoteId)) && (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={Boolean(busy)}
                        onClick={() => void recover(task)}
                      >
                        {task.state === "cancelled"
                          ? "恢复排队/跟踪"
                          : "重试排队"}
                      </Button>
                    )}
                    {active(task) && (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={Boolean(busy)}
                        onClick={() => void cancel(task)}
                      >
                        {task.state === "queued" ? "取消排队" : "停止跟踪"}
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {!tasks.length && (
                <TableRow>
                  <TableCell colSpan={5}>
                    {loading
                      ? "正在读取任务…"
                      : loadError
                        ? "任务暂不可用，请检查后端服务。"
                        : "暂无下载任务"}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
