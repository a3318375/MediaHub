import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card"
import {
  Field,
  FieldLabel,
  FieldGroup,
  FieldDescription,
} from "@/components/ui/field"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import {
  organizeApi,
  type OrganizePlan,
  type OrganizeRule,
} from "@/lib/organize-api"
import {
  directoryIdFromInput,
  type DownloadFile,
  type DownloadMediaContext,
} from "@/lib/download-api"

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
}
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
}
const kinds = [
  { value: "movie", label: "电影" },
  { value: "tv", label: "电视剧" },
  { value: "anime", label: "动漫" },
  { value: "program", label: "节目" },
] as const
export function OrganizePage() {
  const [rules, setRules] = useState<OrganizeRule[]>([])
  const [plans, setPlans] = useState<OrganizePlan[]>([])
  const [rule, setRule] = useState<OrganizeRule>({ ...emptyRule })
  const [selected, setSelected] = useState("")
  const [busy, setBusy] = useState("")
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [revision, setRevision] = useState(0)
  const [bindingFile, setBindingFile] = useState<DownloadFile | null>(null)
  const [binding, setBinding] = useState<DownloadMediaContext>({
    type: "movie",
    title: "",
  })
  const [ready, setReady] = useState(false)
  const plan = plans.find((p) => p.id === selected)
  useEffect(() => {
    const controller = new AbortController()
    let timer: number | undefined
    async function load() {
      try {
        const [r, p] = await Promise.all([
          organizeApi.rules(controller.signal),
          organizeApi.plans(controller.signal),
        ])
        if (!controller.signal.aborted) {
          setRules(r)
          setPlans(p)
        }
      } catch (e) {
        if (!controller.signal.aborted)
          setError(e instanceof Error ? e.message : "读取整理规则失败")
      } finally {
        if (!controller.signal.aborted)
          timer = window.setTimeout(() => void load(), 5000)
      }
    }
    void load()
    return () => {
      controller.abort()
      if (timer !== undefined) window.clearTimeout(timer)
    }
  }, [revision])
  async function act(key: string, action: () => Promise<void>) {
    if (busy) return
    setBusy(key)
    setError("")
    setNotice("")
    try {
      await action()
      setRevision((n) => n + 1)
    } catch (e) {
      setError(e instanceof Error ? e.message : "整理操作失败")
    } finally {
      setBusy("")
    }
  }
  const fields = [
    { key: "sourceId", label: "未整理目录" },
    { key: "movieTargetId", label: "电影目标目录" },
    { key: "tvTargetId", label: "电视剧目标目录" },
    { key: "animeTargetId", label: "动漫目标目录" },
    { key: "programTargetId", label: "节目目标目录" },
  ] as const
  function openBinding(file: DownloadFile) {
    setBindingFile(file)
    setBinding({ type: "movie", title: "" })
    setReady(false)
  }
  return (
    <div className="flex flex-col gap-6 p-6 sm:p-8">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">影视整理</h2>
        <p className="text-sm text-muted-foreground">
          下载完成后统一整理 115 文件。电影使用作品目录，剧集按 Season 和 SxxExx
          命名。
        </p>
      </div>
      {error && (
        <Alert variant="destructive">
          <AlertTitle>操作失败</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {notice && (
        <Alert>
          <AlertTitle>已保存</AlertTitle>
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}
      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{rule.id ? "编辑整理规则" : "新增整理规则"}</CardTitle>
            <CardDescription>
              填写 115 目录 ID 或文件夹链接。定时运行采用北京时间。
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={(event) => {
                event.preventDefault()
                void act("save", async () => {
                  const normalized = { ...rule }
                  for (const f of fields)
                    normalized[f.key] = rule[f.key]
                      ? directoryIdFromInput(rule[f.key])
                      : ""
                  const saved = await organizeApi.save(normalized)
                  setRule(saved)
                  setNotice("规则已保存，可先预览确认。")
                })
              }}
            >
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="organize-name">规则名称</FieldLabel>
                  <Input
                    id="organize-name"
                    required
                    value={rule.name}
                    onChange={(e) => setRule({ ...rule, name: e.target.value })}
                  />
                </Field>
                {fields.map((f) => (
                  <Field key={f.key}>
                    <FieldLabel htmlFor={`organize-${f.key}`}>
                      {f.label}
                    </FieldLabel>
                    <Input
                      id={`organize-${f.key}`}
                      required={f.key === "sourceId"}
                      value={rule[f.key] ?? ""}
                      onChange={(e) =>
                        setRule({ ...rule, [f.key]: e.target.value })
                      }
                    />
                  </Field>
                ))}
                <Field>
                  <FieldLabel htmlFor="organize-time">每天整理时间</FieldLabel>
                  <Input
                    id="organize-time"
                    type="time"
                    required
                    value={rule.dailyAt}
                    onChange={(e) =>
                      setRule({ ...rule, dailyAt: e.target.value })
                    }
                  />
                </Field>
                {(
                  [
                    { key: "enabled", label: "启用定时整理" },
                    { key: "recursive", label: "扫描子目录" },
                    {
                      key: "allowExisting",
                      label: "确认此目录中历史文件已下载完成",
                    },
                    { key: "keepQuality", label: "保留分辨率" },
                    { key: "keepSubgroup", label: "保留字幕组" },
                  ] as const
                ).map((f) => (
                  <Field orientation="horizontal" key={f.key}>
                    <Checkbox
                      id={`organize-${f.key}`}
                      checked={rule[f.key]}
                      onCheckedChange={(value) =>
                        setRule({ ...rule, [f.key]: value === true })
                      }
                    />
                    <FieldLabel htmlFor={`organize-${f.key}`}>
                      {f.label}
                    </FieldLabel>
                  </Field>
                ))}
                <FieldDescription>
                  已有同名目标会保留来源文件。未确认作品身份、季集或下载状态的文件会列入待处理。
                </FieldDescription>
                <div className="flex gap-2">
                  <Button type="submit" disabled={!!busy}>
                    {busy === "save" ? "保存中…" : "保存规则"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setRule({ ...emptyRule })}
                  >
                    新增
                  </Button>
                </div>
              </FieldGroup>
            </form>
          </CardContent>
        </Card>
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>整理规则</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {rules.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  暂无规则。保存规则后可生成预览。
                </p>
              )}
              {rules.map((r) => (
                <div
                  className="flex flex-wrap items-center gap-2 rounded-lg border p-3"
                  key={r.id}
                >
                  <div className="flex-1">
                    <p className="font-medium">{r.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {r.enabled ? `每天 ${r.dailyAt}` : "定时关闭"} · 来源{" "}
                      {r.sourceId}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    disabled={!!busy}
                    onClick={() => setRule(r)}
                  >
                    编辑
                  </Button>
                  <Button
                    disabled={!!busy}
                    onClick={() =>
                      void act(`preview-${r.id}`, async () => {
                        const p = await organizeApi.preview(r.id)
                        setSelected(p.id)
                      })
                    }
                  >
                    {busy === `preview-${r.id}` ? "扫描中…" : "预览"}
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>运行记录</CardTitle>
              <CardDescription>
                手动执行及恢复将在下一次检查时开始，通常一分钟内。
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {plans.length === 0 && (
                <p className="text-sm text-muted-foreground">暂无整理记录。</p>
              )}
              {plans.map((p) => (
                <Button
                  key={p.id}
                  variant={p.id === selected ? "secondary" : "ghost"}
                  className="h-auto justify-start text-left whitespace-normal"
                  onClick={() => setSelected(p.id)}
                >
                  <span>
                    {p.rule.name} · {new Date(p.createdAt).toLocaleString()} ·{" "}
                    {states[p.state] ?? p.state}
                  </span>
                </Button>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
      {plan && (
        <Card>
          <CardHeader>
            <CardTitle>
              {plan.rule.name} · {states[plan.state] ?? plan.state}
            </CardTitle>
            <CardDescription>
              {plan.actions.length} 个文件，{plan.issues.length} 个待处理问题
              {plan.error ? `。${plan.error}` : ""}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {["preview", "paused"].includes(plan.state) && (
              <Button
                className="self-start"
                disabled={!!busy}
                onClick={() =>
                  void act("start", async () => {
                    await organizeApi.start(plan.id)
                    setNotice("整理计划已排队。")
                  })
                }
              >
                {plan.state === "paused" ? "核对后恢复" : "执行此预览"}
              </Button>
            )}
            {plan.actions.map((a) => (
              <div
                key={a.id}
                className="flex flex-col gap-1 rounded-lg border p-3"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium break-all">{a.source.name}</span>
                  <Badge variant="secondary">
                    {states[a.state] ?? a.state}
                  </Badge>
                </div>
                <p className="text-sm break-all text-muted-foreground">
                  → {a.targetRootId}/{a.targetDirectories.join("/")}/
                  {a.targetName}
                </p>
                {a.error && (
                  <p className="text-sm text-destructive">{a.error}</p>
                )}
              </div>
            ))}
            {plan.issues.map((i) => (
              <div
                key={`${i.file.id}-${i.code}`}
                className="flex flex-wrap items-center gap-3 rounded-lg border p-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium break-all">{i.file.name}</p>
                  <p className="text-sm text-muted-foreground">{i.message}</p>
                </div>
                <Button variant="outline" onClick={() => openBinding(i.file)}>
                  绑定作品
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
      <Dialog
        open={!!bindingFile}
        onOpenChange={(open) => {
          if (!open && !busy) setBindingFile(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认文件作品与季集</DialogTitle>
            <DialogDescription>
              {bindingFile?.name}。保存后重新预览规则。
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel>媒体类型</FieldLabel>
              <div className="flex flex-wrap gap-2">
                {kinds.map((k) => (
                  <Button
                    key={k.value}
                    variant={binding.type === k.value ? "default" : "outline"}
                    onClick={() => setBinding({ ...binding, type: k.value })}
                  >
                    {k.label}
                  </Button>
                ))}
              </div>
            </Field>
            <Field>
              <FieldLabel htmlFor="binding-title">作品标题</FieldLabel>
              <Input
                id="binding-title"
                value={binding.title ?? ""}
                onChange={(e) =>
                  setBinding({ ...binding, title: e.target.value })
                }
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="binding-year">年份（可选）</FieldLabel>
              <Input
                id="binding-year"
                type="number"
                value={binding.year ?? ""}
                onChange={(e) =>
                  setBinding({
                    ...binding,
                    year: e.target.value ? Number(e.target.value) : undefined,
                  })
                }
              />
            </Field>
            {binding.type !== "movie" && (
              <>
                <Field>
                  <FieldLabel htmlFor="binding-season">
                    季号（特别篇为 0）
                  </FieldLabel>
                  <Input
                    id="binding-season"
                    type="number"
                    min="0"
                    value={binding.season ?? ""}
                    onChange={(e) =>
                      setBinding({ ...binding, season: Number(e.target.value) })
                    }
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="binding-episode">集号</FieldLabel>
                  <Input
                    id="binding-episode"
                    type="number"
                    min="1"
                    value={binding.episodes?.[0] ?? ""}
                    onChange={(e) =>
                      setBinding({
                        ...binding,
                        episodes: e.target.value
                          ? [Number(e.target.value)]
                          : [],
                      })
                    }
                  />
                </Field>
              </>
            )}
            <Field orientation="horizontal">
              <Checkbox
                id="binding-ready"
                checked={ready}
                onCheckedChange={(v) => setReady(v === true)}
              />
              <FieldLabel htmlFor="binding-ready">
                确认此文件已下载完成
              </FieldLabel>
            </Field>
            <Button
              disabled={!!busy || !binding.title?.trim()}
              onClick={() =>
                void act("binding", async () => {
                  if (!bindingFile) return
                  await organizeApi.bind(bindingFile.id, binding, ready)
                  setBindingFile(null)
                  setNotice("作品绑定已保存，请重新预览。")
                })
              }
            >
              保存绑定
            </Button>
          </FieldGroup>
        </DialogContent>
      </Dialog>
    </div>
  )
}
