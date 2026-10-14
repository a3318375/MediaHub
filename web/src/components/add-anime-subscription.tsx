import { useEffect, useRef, useState } from "react"
import { ArrowLeftIcon, PlusIcon, SearchIcon } from "lucide-react"
import {
  animeApi,
  emptyAnimeDraft,
  type AnimeDraft,
  type AnimePreview,
  type MikanGroup,
  type MikanItem,
} from "@/lib/anime-api"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldDescription,
  FieldSet,
  FieldLegend,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectGroup,
  SelectItem,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"

export function AddAnimeSubscription({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean
  onOpenChange: (value: boolean) => void
  onCreated: () => void
}) {
  const [draft, setDraft] = useState<AnimeDraft>(emptyAnimeDraft)
  const [step, setStep] = useState<"source" | "browse" | "match" | "edit">(
    "source"
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [matchText, setMatchText] = useState("")
  const [excludeText, setExcludeText] = useState("")
  const [preview, setPreview] = useState<AnimePreview | null>(null)
  const [query, setQuery] = useState("")
  const [season, setSeason] = useState("")
  const [items, setItems] = useState<MikanItem[]>([])
  const [seasons, setSeasons] = useState<string[]>([])
  const [groups, setGroups] = useState<MikanGroup[]>([])
  const [selectedGroup, setSelectedGroup] = useState<MikanGroup | null>(null)
  const [selectedRule, setSelectedRule] = useState(-1)
  const [selected, setSelected] = useState<MikanItem | null>(null)
  const controller = useRef<AbortController | null>(null)
  const saving = useRef(false)
  useEffect(() => {
    if (!open) {
      controller.current?.abort()
      return
    }
    return () => controller.current?.abort()
  }, [open])
  function reset() {
    setDraft(emptyAnimeDraft())
    setStep("source")
    setError("")
    setPreview(null)
    setItems([])
    setGroups([])
    setSelected(null)
    setQuery("")
    setSeason("")
    setBusy(false)
  }
  function change<K extends keyof AnimeDraft>(key: K, value: AnimeDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }))
    setPreview(null)
  }
  async function run(action: (signal: AbortSignal) => Promise<void>) {
    controller.current?.abort()
    const current = new AbortController()
    controller.current = current
    setBusy(true)
    setError("")
    try {
      await action(current.signal)
    } catch (e) {
      if (!current.signal.aborted)
        setError(e instanceof Error ? e.message : "请求失败")
    } finally {
      if (controller.current === current) setBusy(false)
    }
  }
  async function resolve(value = draft) {
    await run(async (signal) => {
      const result = await animeApi.resolve(value, signal)
      setDraft(result)
      setMatchText(result.match.join("\n"))
      setExcludeText(result.exclude.join("\n"))
      setPreview(null)
      setStep("edit")
    })
  }
  async function browse(refresh = false) {
    setStep("browse")
    setSelected(null)
    setGroups([])
    await run(async (signal) => {
      const result = await animeApi.catalog(
        query,
        season,
        refresh,
        signal,
        draft.source
      )
      setItems(result.items)
      if (result.seasons.length) setSeasons([...new Set(result.seasons)])
    })
  }
  async function select(item: MikanItem) {
    setSelected(item)
    setGroups([])
    await run(async (signal) =>
      setGroups(await animeApi.groups(item.id, signal, draft.source))
    )
  }
  function close(value: boolean) {
    if (saving.current) return
    controller.current?.abort()
    onOpenChange(value)
    if (!value) reset()
  }
  async function save() {
    if (saving.current) return
    saving.current = true
    await run(async (signal) => {
      await animeApi.create(draft, signal)
      onCreated()
      onOpenChange(false)
      reset()
    })
    saving.current = false
  }
  const rules = (value: string) =>
    value
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent
        className="max-h-[90svh] max-w-3xl overflow-y-auto"
        showCloseButton={!busy}
      >
        <DialogHeader>
          <DialogTitle>添加动漫订阅</DialogTitle>
          <DialogDescription>
            选择单番剧
            RSS，确认作品和规则后保存。添加后立即刷新并自动下载已有匹配资源，后续按定时刷新；目录使用全局设置。
          </DialogDescription>
        </DialogHeader>
        {error && (
          <Alert variant="destructive">
            <AlertDescription role="alert">{error}</AlertDescription>
          </Alert>
        )}
        {step === "source" && (
          <>
            <Tabs
              value={draft.source}
              onValueChange={(value) => {
                if (
                  value === "mikan" ||
                  value === "other" ||
                  value === "ani-bt" ||
                  value === "anime-garden"
                ) {
                  controller.current?.abort()
                  setDraft({ ...emptyAnimeDraft(), source: value })
                  setPreview(null)
                  setSeasons([])
                  setSeason("")
                  setItems([])
                  setGroups([])
                }
              }}
            >
              <TabsList>
                <TabsTrigger value="mikan">Mikan</TabsTrigger>
                <TabsTrigger value="ani-bt">AniBT</TabsTrigger>
                <TabsTrigger value="anime-garden">AnimeGarden</TabsTrigger>
                <TabsTrigger value="other">其他 RSS</TabsTrigger>
              </TabsList>
            </Tabs>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="anime-rss">RSS 地址</FieldLabel>
                <Textarea
                  id="anime-rss"
                  value={draft.url}
                  onChange={(e) => change("url", e.target.value)}
                  placeholder={
                    draft.source === "mikan"
                      ? "https://mikanani.me/RSS/Bangumi?bangumiId=…&subgroupid=…"
                      : draft.source === "ani-bt"
                        ? "https://anibt.net/rss/anime.xml?bgmId=…&groupSlug=…"
                        : draft.source === "anime-garden"
                          ? "https://api.animes.garden/feed.xml?subject=…&fansub=…"
                          : "https://example.com/anime.xml"
                  }
                  disabled={busy}
                />
                <FieldDescription>
                  使用单个番剧与字幕组的 RSS 2.0，避免聚合订阅混入其他作品。
                </FieldDescription>
              </Field>
              {draft.source === "other" && (
                <Field>
                  <FieldLabel htmlFor="anime-bgm">Bangumi ID</FieldLabel>
                  <Input
                    id="anime-bgm"
                    value={draft.bangumiId}
                    onChange={(e) => change("bangumiId", e.target.value)}
                    placeholder="例如 486054"
                    disabled={busy}
                  />
                </Field>
              )}
            </FieldGroup>
            <DialogFooter>
              {draft.source !== "other" && (
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => void browse()}
                >
                  <SearchIcon data-icon="inline-start" />
                  浏览{" "}
                  {draft.source === "mikan"
                    ? "Mikan"
                    : draft.source === "ani-bt"
                      ? "AniBT"
                      : "AnimeGarden"}
                </Button>
              )}
              <Button
                disabled={busy || !draft.url.trim()}
                onClick={() => void resolve()}
              >
                {busy ? "正在解析…" : "下一步"}
              </Button>
            </DialogFooter>
          </>
        )}
        {step === "browse" && (
          <>
            <form
              className="flex flex-wrap items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                void browse()
              }}
            >
              <Field className="min-w-40 flex-1">
                <FieldLabel htmlFor="mikan-query">番剧标题</FieldLabel>
                <Input
                  id="mikan-query"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  disabled={busy}
                />
              </Field>
              <Select
                value={season || "current"}
                onValueChange={(v) => {
                  if (v) setSeason(v === "current" ? "" : v)
                }}
                disabled={busy || Boolean(query)}
              >
                <SelectTrigger aria-label="季度" className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="current">当前季度</SelectItem>
                    {seasons.map((v) => (
                      <SelectItem key={v} value={v}>
                        {v}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <Button type="submit" disabled={busy}>
                {busy ? "加载中…" : "查询"}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => void browse(true)}
              >
                刷新来源
              </Button>
            </form>
            {selected ? (
              <div className="flex flex-col gap-3">
                <Button
                  variant="ghost"
                  className="self-start"
                  onClick={() => {
                    controller.current?.abort()
                    setBusy(false)
                    setSelected(null)
                  }}
                >
                  <ArrowLeftIcon data-icon="inline-start" />
                  返回番剧
                </Button>
                <p className="font-medium">{selected.title}</p>
                {groups.map((g) => (
                  <div
                    key={g.url}
                    className="flex items-center justify-between gap-3 rounded-lg border p-3"
                  >
                    <div className="min-w-0 flex-1">
                      <span>{g.label}</span>
                      {g.items.length > 0 && (
                        <details className="mt-2 text-xs text-muted-foreground">
                          <summary className="cursor-pointer">
                            查看发布记录（{g.items.length}）
                          </summary>
                          <div className="mt-2 flex flex-col gap-2">
                            {g.items.map((item, index) => (
                              <p key={index} className="break-words">
                                {item.title}
                                <br />
                                {item.publishedAt}
                              </p>
                            ))}
                          </div>
                        </details>
                      )}
                    </div>
                    <Button
                      variant="outline"
                      disabled={busy}
                      onClick={() => {
                        setSelectedGroup(g)
                        setSelectedRule(-1)
                        setError("")
                        setStep("match")
                      }}
                    >
                      <PlusIcon data-icon="inline-start" />
                      添加
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex max-h-80 flex-col gap-2 overflow-y-auto">
                {!busy && !items.length && (
                  <p className="py-6 text-center text-muted-foreground">
                    没有找到番剧
                  </p>
                )}
                {items.map((item) => (
                  <Button
                    key={item.id}
                    variant="ghost"
                    className="h-auto justify-start gap-3 py-3"
                    disabled={busy}
                    onClick={() => void select(item)}
                  >
                    {item.poster && (
                      <img
                        src={item.poster}
                        alt=""
                        loading="lazy"
                        className="h-12 w-9 rounded object-cover"
                      />
                    )}
                    <span className="min-w-0 flex-1 text-left whitespace-normal">
                      {item.title}
                    </span>
                    <Badge variant="secondary">{item.week || "未知"}</Badge>
                  </Button>
                ))}
              </div>
            )}
            <DialogFooter>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => setStep("source")}
              >
                返回 RSS
              </Button>
            </DialogFooter>
          </>
        )}
        {step === "match" && selectedGroup && (
          <>
            <p className="font-medium">
              {selected?.title} · {selectedGroup.label}
            </p>
            <FieldSet disabled={busy}>
              <FieldLegend>选择匹配版本</FieldLegend>
              <FieldDescription>
                以下组合来自该字幕组的实际发布标题，所选组合的全部条件都需要命中。全部表示不增加匹配条件，排除规则仍然生效。
              </FieldDescription>
              <FieldGroup>
                <Field
                  orientation="horizontal"
                  className="rounded-lg border p-3"
                >
                  <input
                    id="group-match-all"
                    type="radio"
                    name="group-match"
                    checked={selectedRule === -1}
                    onChange={() => setSelectedRule(-1)}
                  />
                  <FieldLabel htmlFor="group-match-all" className="flex-1">
                    全部
                  </FieldLabel>
                </Field>
                {(selectedGroup.groupRegex?.regexList ?? []).map(
                  (option, index) => (
                    <Field
                      key={index}
                      orientation="horizontal"
                      className="rounded-lg border p-3"
                    >
                      <input
                        id={`group-match-${index}`}
                        type="radio"
                        name="group-match"
                        checked={selectedRule === index}
                        onChange={() => setSelectedRule(index)}
                      />
                      <FieldLabel
                        htmlFor={`group-match-${index}`}
                        className="flex flex-1 flex-wrap gap-2"
                      >
                        {option.map((item) => (
                          <Badge key={item.regex} variant="secondary">
                            {item.label}
                          </Badge>
                        ))}
                      </FieldLabel>
                    </Field>
                  )
                )}
              </FieldGroup>
            </FieldSet>
            {!selectedGroup.groupRegex?.regexList.length && (
              <p className="text-xs text-muted-foreground">
                发布标题没有识别出版本标签，可选择全部，并在下一步自定义规则。
              </p>
            )}
            <DialogFooter>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => setStep("browse")}
              >
                返回字幕组
              </Button>
              <Button
                disabled={busy}
                onClick={() =>
                  void resolve({
                    ...draft,
                    source: draft.source,
                    url: selectedGroup.url,
                    bangumiId: selectedGroup.bangumiId,
                    subgroup: selectedGroup.label,
                    mikanId:
                      draft.source === "mikan" ? (selected?.id ?? "") : "",
                    week:
                      [
                        "星期一",
                        "星期二",
                        "星期三",
                        "星期四",
                        "星期五",
                        "星期六",
                        "星期日",
                      ].indexOf(selected?.week ?? "") + 1,
                    match:
                      selectedRule < 0
                        ? []
                        : (
                            selectedGroup.groupRegex.regexList[selectedRule] ??
                            []
                          ).map((item) => item.regex),
                  })
                }
              >
                {busy ? "正在解析…" : "下一步"}
              </Button>
            </DialogFooter>
          </>
        )}
        {step === "edit" && (
          <>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="anime-title">标题</FieldLabel>
                <Input
                  id="anime-title"
                  value={draft.title}
                  onChange={(e) => change("title", e.target.value)}
                  disabled={busy}
                />
              </Field>
              <p className="text-xs text-muted-foreground">
                Bangumi #{draft.bangumiId} · {draft.subgroup || "字幕组未知"} ·{" "}
                {draft.releaseDate || "首播日期未知"}
              </p>
              <FieldGroup className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {(
                  [
                    ["season", "季", 1, 100],
                    ["offset", "集数偏移", -10000, 10000],
                    ["totalEpisodes", "总集数（0 为未知）", 0, 10000],
                    ["week", "更新星期（0 为未知）", 0, 7],
                  ] as const
                ).map(([key, label, min, max]) => (
                  <Field key={key}>
                    <FieldLabel htmlFor={`anime-${key}`}>{label}</FieldLabel>
                    <Input
                      id={`anime-${key}`}
                      type="number"
                      min={min}
                      max={max}
                      value={draft[key]}
                      disabled={busy}
                      onChange={(e) => change(key, Number(e.target.value))}
                    />
                  </Field>
                ))}
              </FieldGroup>
              <Field>
                <FieldLabel htmlFor="anime-match">匹配规则</FieldLabel>
                <Textarea
                  id="anime-match"
                  value={matchText}
                  disabled={busy}
                  onChange={(e) => {
                    setMatchText(e.target.value)
                    change("match", rules(e.target.value))
                  }}
                />
                <FieldDescription>
                  每行一个 Go 正则，全部命中才保留；留空接受全部。
                </FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="anime-exclude">排除规则</FieldLabel>
                <Textarea
                  id="anime-exclude"
                  value={excludeText}
                  disabled={busy}
                  onChange={(e) => {
                    setExcludeText(e.target.value)
                    change("exclude", rules(e.target.value))
                  }}
                />
                <FieldDescription>
                  任意一条命中即排除。合集与无法识别单集的条目会在预览中说明。
                </FieldDescription>
              </Field>
              <FieldGroup>
                <FieldLabel>备用 RSS（可选）</FieldLabel>
                <FieldDescription>
                  按顺序补充主 RSS；同一集优先保留主 RSS，每个来源独立设置偏移。
                </FieldDescription>
                {draft.standby.map((feed, index) => (
                  <FieldGroup key={index} className="rounded-lg border p-3">
                    <Field>
                      <FieldLabel htmlFor={`standby-label-${index}`}>
                        字幕组名称
                      </FieldLabel>
                      <Input
                        id={`standby-label-${index}`}
                        value={feed.label}
                        disabled={busy}
                        onChange={(e) =>
                          change(
                            "standby",
                            draft.standby.map((v, i) =>
                              i === index ? { ...v, label: e.target.value } : v
                            )
                          )
                        }
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor={`standby-url-${index}`}>
                        备用 RSS 地址
                      </FieldLabel>
                      <Input
                        id={`standby-url-${index}`}
                        value={feed.url}
                        disabled={busy}
                        onChange={(e) =>
                          change(
                            "standby",
                            draft.standby.map((v, i) =>
                              i === index ? { ...v, url: e.target.value } : v
                            )
                          )
                        }
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor={`standby-offset-${index}`}>
                        集数偏移
                      </FieldLabel>
                      <Input
                        id={`standby-offset-${index}`}
                        type="number"
                        min={-10000}
                        max={10000}
                        value={feed.offset}
                        disabled={busy}
                        onChange={(e) =>
                          change(
                            "standby",
                            draft.standby.map((v, i) =>
                              i === index
                                ? { ...v, offset: Number(e.target.value) }
                                : v
                            )
                          )
                        }
                      />
                    </Field>
                    <Button
                      variant="ghost"
                      className="self-start"
                      disabled={busy}
                      onClick={() =>
                        change(
                          "standby",
                          draft.standby.filter((_, i) => i !== index)
                        )
                      }
                    >
                      移除备用 RSS
                    </Button>
                  </FieldGroup>
                ))}
                <Button
                  variant="outline"
                  className="self-start"
                  disabled={busy || draft.standby.length >= 5}
                  onClick={() =>
                    change("standby", [
                      ...draft.standby,
                      { label: "", url: "", offset: 0 },
                    ])
                  }
                >
                  添加备用 RSS
                </Button>
              </FieldGroup>
              <Field orientation="horizontal">
                <FieldLabel htmlFor="anime-enabled">启用订阅</FieldLabel>
                <Switch
                  id="anime-enabled"
                  checked={draft.enabled}
                  disabled={busy}
                  onCheckedChange={(v) => change("enabled", v)}
                />
              </Field>
            </FieldGroup>
            {preview && (
              <div className="flex flex-col gap-2">
                <p className="font-medium">
                  预览：{preview.accepted} / {preview.items.length} 条符合规则
                </p>
                {preview.warnings.map((w) => (
                  <p key={w} className="text-xs text-muted-foreground">
                    {w}
                  </p>
                ))}
                <div className="flex max-h-64 flex-col gap-2 overflow-y-auto">
                  {preview.items.map((it, i) => (
                    <div key={i} className="rounded-lg border p-3">
                      <p className="text-sm break-words">{it.title}</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Badge variant={it.accepted ? "secondary" : "outline"}>
                          {it.reason}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {it.fileName}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <DialogFooter>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => {
                  setStep("source")
                  setPreview(null)
                }}
              >
                返回 RSS
              </Button>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() =>
                  void run(async (signal) =>
                    setPreview(await animeApi.preview(draft, signal))
                  )
                }
              >
                预览规则
              </Button>
              <Button
                disabled={busy || !draft.title.trim()}
                onClick={() => void save()}
              >
                {busy ? "处理中…" : "保存订阅"}
              </Button>
            </DialogFooter>
          </>
        )}
        {busy && (
          <p role="status" className="text-xs text-muted-foreground">
            正在读取来源，请稍候…
          </p>
        )}
      </DialogContent>
    </Dialog>
  )
}
