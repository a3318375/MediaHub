import { useEffect, useState } from "react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
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
import { Switch } from "@/components/ui/switch"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { downloadApi, type AnimeDownloadCandidate } from "@/lib/download-api"
import type { AnimeSubscription } from "@/lib/anime-api"

export function AnimeDownloadDialog({
  anime,
  onClose,
}: {
  anime: AnimeSubscription
  onClose: () => void
}) {
  const [enabled, setEnabled] = useState(false)
  const [fromEpisode, setFromEpisode] = useState(1)
  const [items, setItems] = useState<AnimeDownloadCandidate[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    const controller = new AbortController()
    void downloadApi
      .getAnime(anime.id, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) {
          setEnabled(result.rule.enabled)
          setFromEpisode(result.rule.fromEpisode)
          setItems(result.items)
        }
      })
      .catch((reason) => {
        if (!controller.signal.aborted)
          setError(
            reason instanceof Error ? reason.message : "读取下载配置失败"
          )
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [anime.id])

  const preview: AnimeDownloadCandidate[] = items.length
    ? items
    : (anime.saved?.resources ?? [])
        .filter(
          (item) =>
            item.accepted &&
            item.episode !== null &&
            Number.isInteger(item.episode)
        )
        .map((item, index) => ({
          id: String(index),
          title: item.title,
          episode: item.episode as number,
          state: "pending",
        }))
  const inRange = preview.filter((item) => item.episode >= fromEpisode)
  async function save(event: React.FormEvent) {
    event.preventDefault()
    setError("")
    setBusy(true)
    try {
      await downloadApi.saveAnime(anime.id, {
        enabled,
        directoryId: "library",
        fromEpisode,
      })
      onClose()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "保存下载配置失败")
    } finally {
      setBusy(false)
    }
  }

  async function retry() {
    setBusy(true)
    setError("")
    try {
      const result = await downloadApi.retryAnime(anime.id)
      if (result.count === 0) {
        setError("没有范围内可重试的资源，请先保存启用状态和下载范围。")
      } else {
        const latest = await downloadApi.getAnime(anime.id)
        setItems(latest.items)
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "重试失败")
    } finally {
      setBusy(false)
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
          <DialogTitle>《{anime.title}》下载记录与范围</DialogTitle>
          <DialogDescription>
            新订阅默认自动下载。此处可查看资源记录、调整起始集数或停止下载；目录统一使用设置中的“动漫”文件夹。
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(event) => void save(event)}
          className="flex min-h-0 flex-col gap-4"
        >
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <FieldGroup>
            <Field orientation="horizontal">
              <FieldLabel htmlFor="anime-download-enabled">
                启用自动下载
              </FieldLabel>
              <Switch
                id="anime-download-enabled"
                checked={enabled}
                onCheckedChange={setEnabled}
                disabled={loading || busy}
              />
            </Field>
            <FieldDescription>
              使用设置中的统一下载目录，不需要为每部番剧单独填写目录。
            </FieldDescription>
            <Field>
              <FieldLabel htmlFor="anime-download-from">
                从第几集开始
              </FieldLabel>
              <Input
                id="anime-download-from"
                type="number"
                min={1}
                max={10000}
                value={fromEpisode}
                onChange={(event) => setFromEpisode(Number(event.target.value))}
                required
                disabled={loading || busy}
              />
              <FieldDescription>
                填写 1
                可补已有资源；填写之后的集数可跳过旧集。暂停订阅会停止产生新下载，已入队任务继续。
              </FieldDescription>
            </Field>
          </FieldGroup>
          <p className="text-sm text-muted-foreground">
            {loading
              ? "正在读取候选…"
              : `当前范围内 ${inRange.length} 个资源候选；已入队资源不会重复提交。`}
          </p>
          <div className="max-h-64 overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>集数</TableHead>
                  <TableHead>资源</TableHead>
                  <TableHead>状态</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {inRange.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>{item.episode}</TableCell>
                    <TableCell className="max-w-96 whitespace-normal">
                      {item.title}
                      {item.error && (
                        <p className="text-xs text-destructive">{item.error}</p>
                      )}
                    </TableCell>
                    <TableCell>
                      {item.state === "queued"
                        ? "已入队"
                        : item.state === "failed"
                          ? "解析失败"
                          : item.state === "resolving"
                            ? "解析中"
                            : item.state === "retry"
                              ? "待重试"
                              : "待选择"}
                    </TableCell>
                  </TableRow>
                ))}
                {!inRange.length && (
                  <TableRow>
                    <TableCell colSpan={3}>
                      暂无范围内的资源；启用后等待后续 RSS 刷新。
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          <DialogFooter>
            {items.some(
              (item) => item.state === "failed" || item.state === "retry"
            ) && (
              <Button
                variant="outline"
                type="button"
                disabled={busy || loading}
                onClick={() => void retry()}
              >
                按已保存范围重试失败候选
              </Button>
            )}
            <Button
              variant="outline"
              type="button"
              onClick={onClose}
              disabled={busy}
            >
              取消
            </Button>
            <Button
              type="submit"
              disabled={
                loading ||
                busy ||
                !Number.isInteger(fromEpisode) ||
                fromEpisode < 1
              }
            >
              {busy ? "保存中…" : enabled ? "确认范围并启用" : "保存并停用下载"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
