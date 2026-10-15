import { useCallback, useEffect, useRef, useState } from "react"
import { ChevronLeftIcon, ChevronRightIcon, RefreshCwIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { TVSubscribeButton } from "@/components/tv-subscribe-button"
import {
  ResourceDownloadDialog,
  type DownloadSource,
} from "@/components/resource-download-dialog"
import { tvApi, type TVSubscription } from "@/lib/tv-api"

const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date())
const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "操作失败"
export function TVCalendarPage() {
  const [items, setItems] = useState<TVSubscription[]>([])
  const [month, setMonth] = useState(() => today().slice(0, 7))
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState("")
  const [downloadSource, setDownloadSource] = useState<DownloadSource | null>(
    null
  )
  const [notice, setNotice] = useState("")
  const listRequest = useRef<AbortController | null>(null)
  const load = useCallback(async () => {
    // A slow poll must not overwrite a newer mutation or survive navigation.
    listRequest.current?.abort()
    const controller = new AbortController()
    listRequest.current = controller
    try {
      const data = await tvApi.list(controller.signal)
      if (controller.signal.aborted) return
      setItems(data)
      setError("")
    } catch (e) {
      if (!controller.signal.aborted) setError(errorMessage(e))
    } finally {
      if (!controller.signal.aborted) setLoading(false)
    }
  }, [])
  useEffect(() => {
    let current = true
    const controller = new AbortController()
    listRequest.current = controller
    void tvApi
      .list(controller.signal)
      .then((data) => {
        if (current && !controller.signal.aborted) setItems(data)
      })
      .catch((e: unknown) => {
        if (current && !controller.signal.aborted) setError(errorMessage(e))
      })
      .finally(() => {
        if (current && !controller.signal.aborted) setLoading(false)
      })
    const interval = window.setInterval(() => void load(), 30000)
    return () => {
      current = false
      listRequest.current?.abort()
      window.clearInterval(interval)
    }
  }, [load])
  async function act(id: string, action: () => Promise<unknown>) {
    if (busy) return
    listRequest.current?.abort()
    setBusy(id)
    setError("")
    try {
      await action()
      await load()
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy("")
    }
  }
  function shift(amount: number) {
    const [y, m] = month.split("-").map(Number)
    const date = new Date(y, m - 1 + amount, 1)
    setMonth(
      `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
    )
  }
  const [year, m] = month.split("-").map(Number)
  const first = (new Date(year, m - 1, 1).getDay() + 6) % 7
  const days = new Date(year, m, 0).getDate()
  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold">追剧日历</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            从电视剧详情或影视探索添加订阅，按北京时间显示播出日期。
          </p>
        </div>
        <Button variant="outline" onClick={() => void load()}>
          <RefreshCwIcon />
          刷新列表
        </Button>
      </div>
      {notice && (
        <p role="status" className="text-sm text-primary">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <section className="overflow-hidden rounded-xl border">
        <div className="flex items-center justify-between border-b p-3">
          <Button variant="ghost" aria-label="上个月" onClick={() => shift(-1)}>
            <ChevronLeftIcon />
          </Button>
          <div className="flex items-center gap-3">
            <h3 className="font-semibold">
              {year} 年 {m} 月
            </h3>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setMonth(today().slice(0, 7))}
            >
              本月
            </Button>
          </div>
          <Button variant="ghost" aria-label="下个月" onClick={() => shift(1)}>
            <ChevronRightIcon />
          </Button>
        </div>
        <div className="overflow-x-auto">
          <div className="min-w-[700px]">
            <div className="grid grid-cols-7 border-b bg-muted/40">
              {["一", "二", "三", "四", "五", "六", "日"].map((d) => (
                <div
                  key={d}
                  className="p-2 text-center text-xs text-muted-foreground"
                >
                  周{d}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {Array.from(
                { length: Math.ceil((first + days) / 7) * 7 },
                (_, index) => {
                  const day = index - first + 1
                  const date = `${month}-${String(day).padStart(2, "0")}`
                  return (
                    <div
                      key={index}
                      className={`min-h-28 border-r border-b p-2 ${date === today() ? "bg-primary/5" : ""}`}
                    >
                      {day > 0 && day <= days && (
                        <>
                          <p
                            className={`mb-2 text-xs ${date === today() ? "font-bold text-primary" : "text-muted-foreground"}`}
                          >
                            {day}
                          </p>
                          {items.flatMap((s) =>
                            (s.episodes ?? [])
                              .filter((e) => e.airDate === date)
                              .map((e) => {
                                const resource = s.resources?.find(
                                  (r) =>
                                    r.episode === e.number ||
                                    (r.collectionEnd &&
                                      e.number <= r.collectionEnd)
                                )
                                return (
                                  <div
                                    key={`${s.id}-${e.number}`}
                                    className={`mb-2 rounded-md bg-muted p-2 text-xs ${s.enabled ? "" : "opacity-50"}`}
                                  >
                                    <p className="font-medium">{s.title}</p>
                                    <p className="mt-1">
                                      S{s.season} · 第 {e.number} 集
                                    </p>
                                    <p className="mt-1 text-muted-foreground">
                                      {!s.enabled
                                        ? "已暂停"
                                        : resource
                                          ? `已找到 ${resource.cloud === "115" ? "115 分享" : "磁力"}`
                                          : date > today()
                                            ? "待播出"
                                            : "待搜资源"}
                                    </p>
                                  </div>
                                )
                              })
                          )}
                        </>
                      )}
                    </div>
                  )
                }
              )}
            </div>
          </div>
        </div>
      </section>
      <section className="grid gap-4">
        <h3 className="font-semibold">我的追剧 · {items.length}</h3>
        {loading ? (
          <p role="status">加载订阅中…</p>
        ) : items.length === 0 ? (
          <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
            还没有追剧订阅，去影视探索的电视剧分类添加吧。
          </p>
        ) : (
          items.map((s) => (
            <article key={s.id} className="rounded-xl border p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h4 className="font-semibold">
                    {s.title} · 第 {s.season} 季
                  </h4>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {s.enabled ? "追剧中" : "已暂停"} ·{" "}
                    {s.source === "tg"
                      ? `TG：${s.channels.join(", ")}`
                      : "PanSou"}{" "}
                    · 已找到 {s.resources?.length ?? 0} 条资源
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <TVSubscribeButton
                    key={`${s.id}-${s.source}-${s.match}-${s.exclude}-${s.channels?.join(",")}`}
                    tmdbId={s.tmdbId}
                    title={s.title}
                    subscription={s}
                    onSaved={() => void load()}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy !== ""}
                    onClick={() => void act(s.id, () => tvApi.refresh(s.id))}
                  >
                    {busy === s.id ? "处理中…" : "立即检查"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy !== ""}
                    onClick={() =>
                      void act(s.id, () =>
                        tvApi.update(s.id, { ...s, enabled: !s.enabled })
                      )
                    }
                  >
                    {s.enabled ? "暂停" : "恢复"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy !== ""}
                    onClick={() => {
                      if (
                        window.confirm(
                          `取消订阅《${s.title}》第 ${s.season} 季？`
                        )
                      )
                        void act(s.id, () => tvApi.remove(s.id))
                    }}
                  >
                    取消订阅
                  </Button>
                </div>
              </div>
              {(!s.episodes?.length || s.episodes.some((e) => !e.airDate)) && (
                <p className="mt-3 text-xs text-muted-foreground">
                  部分或全部播出日期未知，每天检查一次。
                </p>
              )}
              {(s.lastError || s.metadataError) && (
                <p role="status" className="mt-3 text-xs text-destructive">
                  {[s.metadataError, s.lastError].filter(Boolean).join("；")}
                </p>
              )}
              <p className="mt-3 text-xs text-muted-foreground">
                上次检查：
                {s.lastCheckedAt
                  ? new Date(s.lastCheckedAt).toLocaleString("zh-CN", {
                      timeZone: "Asia/Shanghai",
                    })
                  : "等待首次检查"}
                {s.enabled && s.nextCheckAt
                  ? ` · 下次检查：${new Date(s.nextCheckAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}`
                  : ""}
              </p>
              {!!s.resources?.length && (
                <details className="mt-3">
                  <summary className="cursor-pointer text-sm">
                    查看匹配资源
                  </summary>
                  <ul className="mt-2 grid gap-2">
                    {s.resources.map((r) => (
                      <li
                        key={r.episode}
                        className="rounded-md bg-muted/50 p-3 text-xs break-all"
                      >
                        <a
                          className="font-medium text-primary underline"
                          href={r.url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {r.collectionEnd
                            ? `合集更新至第 ${r.collectionEnd} 集`
                            : `第 ${r.episode} 集`}{" "}
                          · {r.cloud === "115" ? "115 分享" : "磁力"} ·{" "}
                          {r.size > 0
                            ? `${(r.size / 1024 ** 3).toFixed(2)} GB`
                            : "体积未知"}
                        </a>
                        <p className="mt-1 text-muted-foreground">{r.title}</p>
                        {r.password && <p>提取码：{r.password}</p>}
                        <Button
                          size="sm"
                          variant="outline"
                          className="mt-2"
                          onClick={() => {
                            const media = {
                              type: "tv" as const,
                              title: s.title,
                              provider: "tmdb",
                              providerId: s.tmdbId,
                              season: s.season,
                              episodes: r.collectionEnd
                                ? undefined
                                : [r.episode],
                            }
                            setDownloadSource({
                              url: r.url,
                              password: r.password,
                              title: r.title,
                              media,
                              reference: {
                                source: "tv_subscription",
                                sourceId: s.id,
                                media,
                              },
                            })
                          }}
                        >
                          {r.cloud === "115"
                            ? "选择文件并转存"
                            : "提交公共下载"}
                        </Button>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </article>
          ))
        )}
      </section>
      {downloadSource && (
        <ResourceDownloadDialog
          source={downloadSource}
          onClose={() => setDownloadSource(null)}
          onCreated={() => setNotice("已提交公共下载，可在下载任务中查看进度")}
        />
      )}
    </div>
  )
}
