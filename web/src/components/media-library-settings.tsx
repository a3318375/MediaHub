import { useEffect, useState } from "react"
import { organizeApi, type OrganizePlan } from "@/lib/organize-api"
import { directoryIdFromInput } from "@/lib/download-api"
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldDescription,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { DownloadsPage } from "@/components/downloads-page"
import { LibraryDirectoryPicker } from "@/components/library-directory-picker"

export function MediaLibrarySettings() {
  const [picking, setPicking] = useState<"sourceId" | "targetId" | null>(null)
  const [paths, setPaths] = useState({ sourceId: "", targetId: "" })
  const [config, setConfig] = useState({
    sourceId: "",
    targetId: "",
    cron: "",
    enabled: false,
    id: "",
    scheduleError: "",
  })
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [plan, setPlan] = useState<OrganizePlan | null>(null)
  const [runs, setRuns] = useState<OrganizePlan[]>([])
  const [runsError, setRunsError] = useState("")
  useEffect(() => {
    const c = new AbortController()
    let timer: number | undefined
    async function load() {
      try {
        const result = await organizeApi.plans(c.signal)
        if (!c.signal.aborted) {
          setRuns(result.filter((p) => p.mode === "scheduled").slice(0, 3))
          setRunsError("")
          setPlan((current) =>
            current
              ? (result.find((p) => p.id === current.id) ?? current)
              : null
          )
        }
      } catch (e) {
        if (!c.signal.aborted)
          setRunsError(e instanceof Error ? e.message : "读取整理记录失败")
      } finally {
        if (!c.signal.aborted)
          timer = window.setTimeout(() => void load(), 5000)
      }
    }
    void load()
    return () => {
      c.abort()
      if (timer !== undefined) window.clearTimeout(timer)
    }
  }, [])
  useEffect(() => {
    const c = new AbortController()
    void organizeApi
      .config(c.signal)
      .then((r) => {
        if (!c.signal.aborted)
          setConfig({
            ...r,
            id: r.id ?? "",
            scheduleError: r.scheduleError ?? "",
          })
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message)
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false)
      })
    return () => c.abort()
  }, [])
  async function save() {
    setBusy(true)
    setError("")
    try {
      const r = await organizeApi.saveConfig({
        cron: config.cron,
        enabled: config.enabled,
        sourceId: directoryIdFromInput(config.sourceId),
        targetId: directoryIdFromInput(config.targetId),
      })
      setConfig({ ...r, id: r.id ?? "", scheduleError: r.scheduleError ?? "" })
      setPlan(null)
      setNotice(
        r.enabled
          ? "已保存，Cron 有效，定时整理已启用。"
          : r.scheduleError
            ? `目录已保存，Cron 无效，定时整理已停用：${r.scheduleError}`
            : "目录已保存，未填写 Cron，定时整理已停用。"
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败")
    } finally {
      setBusy(false)
    }
  }
  return (
    <FieldGroup>
      {picking && (
        <LibraryDirectoryPicker
          onClose={() => setPicking(null)}
          onSelect={(id, path) => {
            setConfig({ ...config, [picking]: id })
            setPaths({ ...paths, [picking]: path })
            setPicking(null)
          }}
        />
      )}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {notice && (
        <Alert>
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}
      <Field>
        <FieldLabel htmlFor="library-source">未整理目录</FieldLabel>
        <Button
          className="self-start"
          variant="outline"
          disabled={busy || loading}
          onClick={() => setPicking("sourceId")}
        >
          {paths.sourceId
            ? paths.sourceId
            : config.sourceId
              ? "已选择文件夹，点击更换"
              : "选择文件夹"}
        </Button>
        <details>
          <summary className="cursor-pointer text-xs text-muted-foreground">
            手动输入链接或 ID
          </summary>
          <Input
            id="library-source"
            disabled={busy || loading}
            value={config.sourceId}
            placeholder="选择下载存放的 115 文件夹链接或 ID"
            onChange={(e) => setConfig({ ...config, sourceId: e.target.value })}
          />
        </details>
        <FieldDescription>
          例如 /test。下载时自动创建 /test/动漫、/test/电影等分类目录。
        </FieldDescription>
      </Field>
      <Field>
        <FieldLabel htmlFor="library-target">已整理目录</FieldLabel>
        <Button
          className="self-start"
          variant="outline"
          disabled={busy || loading}
          onClick={() => setPicking("targetId")}
        >
          {paths.targetId
            ? paths.targetId
            : config.targetId
              ? "已选择文件夹，点击更换"
              : "选择文件夹"}
        </Button>
        <details>
          <summary className="cursor-pointer text-xs text-muted-foreground">
            手动输入链接或 ID
          </summary>
          <Input
            id="library-target"
            disabled={busy || loading}
            value={config.targetId}
            placeholder="115 媒体库文件夹链接或 ID"
            onChange={(e) => setConfig({ ...config, targetId: e.target.value })}
          />
        </details>
        <FieldDescription>
          归档后自动分为电影、电视剧、动漫和节目，按 Emby
          规则命名。子目录会自动扫描。
        </FieldDescription>
      </Field>
      <Field>
        <FieldLabel htmlFor="library-time">整理时间（Cron）</FieldLabel>
        <Input
          id="library-time"
          disabled={busy || loading}
          value={config.cron}
          placeholder="0 3 * * *"
          onChange={(e) => setConfig({ ...config, cron: e.target.value })}
        />
        <FieldDescription>
          可自行让 AI 生成 Cron 表达式。使用 5 段格式：分钟 小时 日 月
          星期，按北京时间执行。例如 0 3 * * * 表示每天 03:00；*/30 * * * *
          表示每 30 分钟。 留空或填写错误不启用定时；有效表达式保存后自动启用。
        </FieldDescription>
      </Field>
      <FieldDescription>
        已保存的定时状态：{config.enabled ? "已启用" : "未启用"}
        {config.scheduleError ? `。${config.scheduleError}` : ""}
      </FieldDescription>
      <div className="flex flex-wrap gap-2">
        <Button disabled={busy || loading} onClick={() => void save()}>
          {busy ? "处理中…" : "保存"}
        </Button>
        <Button
          variant="outline"
          disabled={busy || loading || !config.id}
          onClick={async () => {
            setBusy(true)
            setError("")
            try {
              setPlan(await organizeApi.preview(config.id))
              setNotice("")
            } catch (e) {
              setError(e instanceof Error ? e.message : "预览失败")
            } finally {
              setBusy(false)
            }
          }}
        >
          查看整理预览
        </Button>
      </div>
      {runsError && (
        <Alert variant="destructive">
          <AlertDescription>{runsError}</AlertDescription>
        </Alert>
      )}
      {runs.map((run) => (
        <Alert key={run.id}>
          <AlertDescription>
            <p>
              {new Date(run.createdAt).toLocaleString()} ·{" "}
              {(
                {
                  running: "整理中",
                  paused: "已暂停",
                  completed: "整理完成",
                  completed_with_issues: "完成，有待确认文件",
                } as Record<string, string>
              )[run.state] ?? run.state}{" "}
              · 已整理{" "}
              {run.actions.filter((a) => a.state === "completed").length}/
              {run.actions.length} 个文件
            </p>
            {run.error && <p>{run.error}</p>}
            <Button variant="outline" size="sm" onClick={() => setPlan(run)}>
              查看详情
            </Button>
            {run.state === "paused" && (
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={async () => {
                  setBusy(true)
                  try {
                    await organizeApi.start(run.id)
                    setNotice("已恢复，将先核对文件实际状态。")
                  } catch (e) {
                    setError(e instanceof Error ? e.message : "恢复失败")
                  } finally {
                    setBusy(false)
                  }
                }}
              >
                核对后恢复
              </Button>
            )}
          </AlertDescription>
        </Alert>
      ))}
      {plan && (
        <>
          <FieldDescription>
            {plan.actions.length} 个文件可整理，{plan.issues.length}{" "}
            个文件需要确认。作品或季集不明确时保留原文件；同名目标不会覆盖。
          </FieldDescription>
          {plan.actions.slice(0, 30).map((a) => (
            <p key={a.id} className="text-sm break-all">
              {a.source.name} → {a.targetDirectories.join("/")}/{a.targetName}
              {a.error ? `（${a.error}）` : ""}
            </p>
          ))}
          {plan.issues.slice(0, 30).map((i) => (
            <p
              key={i.file.id}
              className="text-sm break-all text-muted-foreground"
            >
              {i.file.name}：{i.message}
            </p>
          ))}
          <Button
            className="self-start"
            disabled={busy || plan.state !== "preview"}
            onClick={async () => {
              setBusy(true)
              try {
                setPlan(await organizeApi.start(plan.id))
                setNotice("已加入整理队列。")
              } catch (e) {
                setError(e instanceof Error ? e.message : "执行失败")
              } finally {
                setBusy(false)
              }
            }}
          >
            整理这些文件
          </Button>
        </>
      )}
      <FieldDescription>
        这里只归档和重命名。NFO、图片及 Emby 刮削暂不在此配置。
      </FieldDescription>
      <details>
        <summary className="cursor-pointer text-sm font-medium">
          下载记录与异常处理
        </summary>
        <DownloadsPage recordsOnly />
      </details>
    </FieldGroup>
  )
}
