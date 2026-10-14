import { ArrowLeftIcon } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { getAccessToken } from "@/lib/auth-api"
import type { DownloadSource } from "@/components/resource-download-dialog"
import {
  downloadApi,
  is115ShareURL,
  type DownloadMediaContext,
} from "@/lib/download-api"
import {
  resourceSearchPlan,
  safeResourceURL,
  RESOURCE_SEARCH_CONFIG_CHANGED,
  type ResourceSearchMeta,
  readMediaSearchHistory,
  readResourceSearchHistory,
  RESOURCE_SEARCH_HISTORY_KEY,
  RESOURCE_SEARCH_RESULT_KEY,
  saveResourceSearchHistory,
  type MediaSearchHistoryEntry,
  type ResourceSearchHistoryEntry,
} from "@/lib/resource-search"

type SearchConfig = ResourceSearchHistoryEntry
type Meta = ResourceSearchMeta
type Link = {
  cloud: string
  url: string
  password?: string
  note?: string
  source?: string
  updatedAt?: string
}
type LinkHealth = {
  disk_type: string
  url: string
  state: string
  summary?: string
  expires_at: number
}
const linkHealthLabels: Record<string, string> = {
  ok: "有效",
  bad: "失效",
  locked: "需要提取码",
  unsupported: "暂不支持检测",
  uncertain: "待确认",
}
const linkHealthKey = (link: Link) =>
  JSON.stringify([link.cloud, link.url, link.password ?? ""])

type Result = {
  total: number
  items: { title: string; links?: Link[] }[]
  linksByCloud: Record<string, Link[]>
}
function mergeResourceSearchResults(current: Result, incoming: Result): Result {
  const linksByCloud: Record<string, Link[]> = {}
  const cloudTypes = new Set([
    ...Object.keys(current.linksByCloud ?? {}),
    ...Object.keys(incoming.linksByCloud ?? {}),
  ])

  for (const cloud of cloudTypes) {
    const links = new Map<string, Link>()
    for (const link of incoming.linksByCloud?.[cloud] ?? []) {
      const key = link.url.trim()
      if (key) links.set(key, link)
    }
    for (const link of current.linksByCloud?.[cloud] ?? []) {
      const key = link.url.trim()
      if (key && !links.has(key)) links.set(key, link)
    }
    if (links.size) linksByCloud[cloud] = [...links.values()]
  }

  const items = [...(incoming.items ?? [])]
  const itemKeys = new Set(
    items.map((item) =>
      item.links?.length
        ? item.links
            .map((link) => link.url.trim())
            .sort()
            .join("|")
        : item.title.trim().toLocaleLowerCase()
    )
  )
  for (const item of current.items ?? []) {
    const key = item.links?.length
      ? item.links
          .map((link) => link.url.trim())
          .sort()
          .join("|")
      : item.title.trim().toLocaleLowerCase()
    if (!itemKeys.has(key)) {
      items.push(item)
      itemKeys.add(key)
    }
  }

  return {
    ...current,
    ...incoming,
    total: Object.values(linksByCloud).reduce(
      (total, links) => total + links.length,
      0
    ),
    items,
    linksByCloud,
  }
}

type SavedSearchResult = {
  config: SearchConfig
  result: Result
  tab: string
  media?: DownloadMediaContext
}

function readSavedSearchResult(storage: Storage): SavedSearchResult | null {
  try {
    const saved = JSON.parse(
      storage.getItem(RESOURCE_SEARCH_RESULT_KEY) ?? "null"
    )
    const linksByCloud = saved?.result?.linksByCloud
    if (
      saved &&
      typeof saved === "object" &&
      saved.config &&
      saved.result &&
      typeof saved.config.keyword === "string" &&
      typeof saved.result.total === "number" &&
      (linksByCloud === undefined ||
        linksByCloud === null ||
        (typeof linksByCloud === "object" && !Array.isArray(linksByCloud)))
    ) {
      return {
        ...(saved as SavedSearchResult),
        result: {
          ...saved.result,
          linksByCloud: linksByCloud ?? {},
        },
      }
    }
  } catch {
    // Ignore stale or malformed session data.
  }
  return null
}
const cloudLabels: Record<string, string> = {
  baidu: "百度",
  aliyun: "阿里",
  115: "115",
  123: "123",
  xunlei: "迅雷",
  quark: "夸克",
  guangya: "光鸭",
  mobile: "移动",
  tianyi: "天翼",
  uc: "UC",
  pikpak: "PikPak",
  ed2k: "电驴",
  magnet: "磁力",
  other: "其他",
  others: "其他",
}
function authHeaders() {
  const token = getAccessToken()
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}
export function ResourceSearchPage({
  searchRequest,
  onSearchRequestHandled,
  showExploreBack,
  onBackToExplore,
}: {
  searchRequest: {
    id: number
    keyword: string
    media?: DownloadMediaContext
  } | null
  onSearchRequestHandled: (id: number) => void
  showExploreBack: boolean
  onBackToExplore: () => void
}) {
  const [savedSearch] = useState(() => readSavedSearchResult(sessionStorage))
  const [meta, setMeta] = useState<Meta | null>(null),
    [query, setQuery] = useState(
      searchRequest?.keyword ?? savedSearch?.config.keyword ?? ""
    ),
    [result, setResult] = useState<Result | null>(
      searchRequest ? null : (savedSearch?.result ?? null)
    ),
    [lastConfig, setLastConfig] = useState<SearchConfig | null>(
      searchRequest ? null : (savedSearch?.config ?? null)
    ),
    [loading, setLoading] = useState(Boolean(searchRequest)),
    [updating, setUpdating] = useState(Boolean(searchRequest)),
    [error, setError] = useState(""),
    [history, setHistory] = useState<SearchConfig[]>(() =>
      readResourceSearchHistory(localStorage)
    ),
    [mediaHistory, setMediaHistory] = useState<MediaSearchHistoryEntry[]>(() =>
      readMediaSearchHistory(localStorage)
    ),
    [tab, setTab] = useState(savedSearch?.tab ?? ""),
    [copyMessage, setCopyMessage] = useState("")
  const [linkHealth, setLinkHealth] = useState<Record<string, LinkHealth>>({})
  const [downloading, setDownloading] = useState("")
  async function downloadResource(source: DownloadSource) {
    if (downloading) return
    setDownloading(source.url)
    setError("")
    try {
      await downloadApi.create({
        kind: is115ShareURL(source.url) ? "share_transfer" : "offline",
        ...(is115ShareURL(source.url)
          ? { wholeShare: true, receiveCode: source.password ?? "" }
          : {}),
        url: source.url,
        directoryId: "",
        reference: {
          source: "media_search",
          sourceId: source.media?.providerId
            ? `${source.media.provider}:${source.media.type}:${source.media.providerId}`
            : undefined,
          media: {
            ...source.media,
            type: source.media?.type ?? "movie",
            title: source.media?.title ?? source.title,
          },
        },
      })
      setCopyMessage("已加入下载队列，完成后按设置自动整理。")
    } catch (e) {
      setError(e instanceof Error ? e.message : "下载提交失败")
    } finally {
      setDownloading("")
    }
  }
  const mediaContext = useRef<{
    keyword: string
    media?: DownloadMediaContext
  }>({ keyword: savedSearch?.config.keyword ?? "", media: savedSearch?.media })
  const linkHealthCache = useRef<Record<string, LinkHealth>>({})
  const timers = useRef<number[]>([]),
    runId = useRef(0),
    requestController = useRef<AbortController | null>(null),
    searchRef = useRef<(config?: SearchConfig) => void>(() => {})
  useEffect(() => {
    let active = true
    const controller = new AbortController()
    const load = () =>
      fetch("/api/v1/resources/meta", {
        headers: authHeaders(),
        signal: controller.signal,
      })
        .then((response) => {
          if (!response.ok) throw Error("无法读取资源搜索配置")
          return response.json()
        })
        .then(({ data }) => {
          if (active) setMeta(data)
        })
        .catch((error: unknown) => {
          if (!active) return
          setError(
            error instanceof Error ? error.message : "无法读取资源搜索配置"
          )
          setLoading(false)
          setUpdating(false)
        })
    void load()
    window.addEventListener(RESOURCE_SEARCH_CONFIG_CHANGED, load)
    return () => {
      active = false
      controller.abort()
      window.removeEventListener(RESOURCE_SEARCH_CONFIG_CHANGED, load)
      timers.current.forEach(clearTimeout)
      requestController.current?.abort()
    }
  }, [])
  const search = useCallback(
    async (config?: SearchConfig) => {
      const keyword = (config?.keyword ?? query).trim()
      if (!keyword) return
      if (keyword !== mediaContext.current.keyword)
        mediaContext.current = { keyword }
      timers.current.forEach(clearTimeout)
      timers.current = []
      requestController.current?.abort()
      const controller = new AbortController()
      requestController.current = controller
      const id = ++runId.current
      setLoading(true)
      setUpdating(true)
      setError("")
      let currentMeta: Meta
      try {
        const response = await fetch("/api/v1/resources/meta", {
          headers: authHeaders(),
          signal: controller.signal,
        })
        if (!response.ok) throw Error("无法读取资源搜索配置")
        currentMeta = (await response.json()).data as Meta
      } catch (error: unknown) {
        if (runId.current === id && !controller.signal.aborted) {
          setError(
            error instanceof Error ? error.message : "无法读取资源搜索配置"
          )
          setLoading(false)
          setUpdating(false)
        }
        return
      }
      if (controller.signal.aborted || runId.current !== id) return
      setMeta(currentMeta)
      const selection = currentMeta.selection
      const plan = resourceSearchPlan(selection)
      const chosen: SearchConfig = {
        keyword,
        source: plan.fullSource,
        mode: "merge",
        cloudTypes: selection.cloudTypes,
        plugins: selection.plugins,
        channels: selection.channels,
        at: Date.now(),
      }
      setQuery(keyword)
      setLastConfig(chosen)
      setLoading(true)
      setUpdating(true)
      setError("")
      setResult(null)
      linkHealthCache.current = {}
      setLinkHealth({})
      setHistory(saveResourceSearchHistory(localStorage, chosen))
      const call = async (src: string, force: boolean) => {
        const response = await fetch("/api/v1/resources/search", {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({
            query: keyword,
            source: src,
            mode: chosen.mode,
            cloudTypes: chosen.cloudTypes,
            plugins: chosen.plugins,
            channels: chosen.channels,
            refresh: force,
          }),
          signal: controller.signal,
        })
        const body = await response.json().catch(() => ({}))
        if (!response.ok)
          throw Error(
            body.error ?? body.message ?? `搜索失败 (${response.status})`
          )
        return body.data as Result
      }
      try {
        if (plan.disabled) {
          setResult({ total: 0, items: [], linksByCloud: {} })
          setError("请在全局设置中选择 TG 频道或搜索插件")
          return
        }
        const firstSource = plan.firstSource
        const refreshSource = plan.fullSource
        if (plan.warmup) {
          void call(refreshSource, false).catch((error: unknown) => {
            if (!controller.signal.aborted)
              console.warn("资源搜索预热失败", error)
          })
        }
        const first = await call(firstSource, false)
        if (runId.current !== id) return
        setResult(first)
        setTab(Object.keys(first.linksByCloud ?? {})[0] ?? "")
        setLoading(false)
        const hasPluginSearch = plan.collect
        const steps = hasPluginSearch
          ? [2000, 3000, 3000].map((delay) => ({
              delay,
              src: refreshSource,
              refresh: false,
            }))
          : []
        setUpdating(steps.length > 0)
        let previous = Date.now()
        for (const step of steps) {
          if (controller.signal.aborted) return
          const delay = Math.max(0, step.delay - (Date.now() - previous))
          await new Promise<void>((resolve) => {
            const timer = window.setTimeout(resolve, delay)
            timers.current.push(timer)
            controller.signal.addEventListener(
              "abort",
              () => {
                window.clearTimeout(timer)
                resolve()
              },
              { once: true }
            )
          })
          if (runId.current !== id || controller.signal.aborted) return
          try {
            const next = await call(step.src, false)
            if (runId.current !== id || controller.signal.aborted) return
            setResult((current) => {
              if (!current) return next
              const merged = mergeResourceSearchResults(current, next)
              setTab((selectedTab) =>
                selectedTab && merged.linksByCloud[selectedTab]
                  ? selectedTab
                  : (Object.keys(merged.linksByCloud)[0] ?? "")
              )
              return merged
            })
          } catch (e) {
            if (runId.current === id && !controller.signal.aborted)
              setError(e instanceof Error ? e.message : "搜索更新失败")
          }
          previous = Date.now()
        }
      } catch (e) {
        if (runId.current === id && !controller.signal.aborted)
          setError(e instanceof Error ? e.message : "搜索失败")
      } finally {
        if (runId.current === id) {
          setLoading(false)
          setUpdating(false)
        }
      }
    },
    [query]
  )
  useEffect(() => {
    searchRef.current = (config) => {
      void search(config)
    }
  }, [search])
  useEffect(() => {
    if (!searchRequest || !meta) return
    mediaContext.current = {
      keyword: searchRequest.keyword,
      media: searchRequest.media,
    }
    searchRef.current({
      keyword: searchRequest.keyword,
      source: "all",
      mode: "merge",
      cloudTypes: [],
      plugins: [],
      channels: [],
      at: Date.now(),
    })
    onSearchRequestHandled(searchRequest.id)
  }, [searchRequest, meta, onSearchRequestHandled])

  useEffect(() => {
    if (!result || !lastConfig) return
    try {
      sessionStorage.setItem(
        RESOURCE_SEARCH_RESULT_KEY,
        JSON.stringify({
          config: lastConfig,
          result,
          tab,
          media: mediaContext.current.media,
        } satisfies SavedSearchResult)
      )
    } catch {
      // Keep the current in-memory result if the browser storage quota is full.
    }
  }, [lastConfig, result, tab])
  const detectionLinks = JSON.stringify(result?.linksByCloud?.[tab] ?? [])
  const detectionEnabled = meta?.selection.detectionEnabled ?? false
  useEffect(() => {
    if (!detectionEnabled || !window.IntersectionObserver) return
    const links = JSON.parse(detectionLinks) as Link[]
    const byKey = new Map(links.map((link) => [linkHealthKey(link), link]))
    const pending = new Map<string, Link>()
    const seen = new Set<string>()
    const controller = new AbortController()
    let timer: number | undefined
    let running = false
    const collect = async () => {
      if (running || controller.signal.aborted) return
      running = true
      try {
        while (pending.size && !controller.signal.aborted) {
          const batch = [...pending.entries()].slice(0, 6)
          batch.forEach(([key]) => pending.delete(key))
          let results: LinkHealth[]
          try {
            const response = await fetch("/api/v1/resources/check", {
              method: "POST",
              headers: authHeaders(),
              signal: controller.signal,
              body: JSON.stringify({
                items: batch.map(([, link]) => ({
                  disk_type: link.cloud,
                  url: link.url,
                  password: link.password,
                })),
              }),
            })
            if (!response.ok) throw new Error("链接检测失败")
            results = (await response.json()).results as LinkHealth[]
          } catch {
            if (controller.signal.aborted) return
            results = batch.map(([, link]) => ({
              disk_type: link.cloud,
              url: link.url,
              state: "uncertain",
              summary: "检测失败，可稍后重试",
              expires_at: Date.now() + 30_000,
            }))
          }
          if (controller.signal.aborted) return
          const updates: Record<string, LinkHealth> = {}
          for (const [key, link] of batch) {
            const health = results.find(
              (item) => item.disk_type === link.cloud && item.url === link.url
            )
            if (health) updates[key] = health
          }
          Object.assign(linkHealthCache.current, updates)
          setLinkHealth((current) => ({ ...current, ...updates }))
        }
      } finally {
        running = false
      }
    }
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        const key = (entry.target as HTMLElement).dataset.resourceLink
        if (!key || seen.has(key)) continue
        const cached = linkHealthCache.current[key]
        if (cached && cached.expires_at > Date.now()) continue
        const link = byKey.get(key)
        if (!link || !safeResourceURL(link.url)) continue
        seen.add(key)
        pending.set(key, link)
      }
      if (pending.size && !running) {
        window.clearTimeout(timer)
        timer = window.setTimeout(() => void collect(), 220)
      }
    })
    document
      .querySelectorAll("[data-resource-link]")
      .forEach((element) => observer.observe(element))
    return () => {
      observer.disconnect()
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [detectionEnabled, detectionLinks])
  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value)
      setCopyMessage("复制成功")
    } catch {
      setCopyMessage("复制失败，请检查浏览器权限")
    }
    window.setTimeout(() => setCopyMessage(""), 1800)
  }
  return (
    <main className="flex flex-1 flex-col gap-4 p-4 sm:p-6 lg:p-8">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            {showExploreBack && (
              <Button variant="ghost" size="sm" onClick={onBackToExplore}>
                <ArrowLeftIcon data-icon="inline-start" />
                返回
              </Button>
            )}
            <CardTitle>资源搜索</CardTitle>
          </div>
          {(history.length > 0 || mediaHistory.length > 0) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                localStorage.removeItem(RESOURCE_SEARCH_HISTORY_KEY)
                setHistory([])
                setMediaHistory([])
              }}
            >
              清空历史
            </Button>
          )}
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-2">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void search()}
              placeholder="输入电影、剧集或动画名称"
              className="min-w-52 flex-1"
            />
            <Button disabled={loading || !meta} onClick={() => void search()}>
              搜索
            </Button>
          </div>
        </CardContent>
      </Card>
      {mediaHistory.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>影视探索搜索记录</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {mediaHistory.slice(0, 5).map((entry) => (
              <div
                key={`${entry.source}-${entry.keyword}-${entry.at}`}
                className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b pb-2 last:border-b-0 last:pb-0"
              >
                <span className="font-medium">{entry.keyword}</span>
                <span className="text-sm text-muted-foreground">
                  {entry.source} · {new Date(entry.at).toLocaleString()}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {copyMessage && (
        <p role="status" className="text-sm text-muted-foreground">
          {copyMessage}
        </p>
      )}
      {loading && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            正在搜索资源…
          </CardContent>
        </Card>
      )}
      {result && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>
              搜索结果 <Badge variant="secondary">{result.total}</Badge>
            </CardTitle>
            {updating && (
              <span className="text-sm text-muted-foreground">
                正在收集插件结果…
              </span>
            )}
          </CardHeader>
          <CardContent>
            {Object.keys(result.linksByCloud ?? {}).length ? (
              <Tabs value={tab} onValueChange={setTab}>
                <TabsList className="max-w-full flex-wrap">
                  {Object.keys(result.linksByCloud).map((k) => (
                    <TabsTrigger key={k} value={k}>
                      {cloudLabels[k] ?? k} (
                      {result.linksByCloud[k]?.length ?? 0})
                    </TabsTrigger>
                  ))}
                </TabsList>
                {Object.entries(result.linksByCloud).map(([cloud, links]) => (
                  <TabsContent
                    key={cloud}
                    value={cloud}
                    className="space-y-3 pt-3"
                  >
                    {links.map((link, i) => (
                      <article
                        key={`${link.url}-${i}`}
                        data-resource-link={linkHealthKey(link)}
                        className="rounded-lg border p-3"
                      >
                        <p className="font-medium">
                          {result.items
                            ?.flatMap((item) => item.links ?? [])
                            .find((x) => x.url === link.url)
                            ? result.items.find((item) =>
                                item.links?.some((x) => x.url === link.url)
                              )?.title
                            : (link.note ?? link.url)}
                        </p>
                        <p className="mt-1 text-xs break-all text-muted-foreground">
                          {detectionEnabled &&
                            linkHealth[linkHealthKey(link)] && (
                              <Badge
                                variant="outline"
                                title={linkHealth[linkHealthKey(link)].summary}
                              >
                                {linkHealthLabels[
                                  linkHealth[linkHealthKey(link)].state
                                ] ?? "待确认"}
                              </Badge>
                            )}{" "}
                          {link.source}{" "}
                          {link.updatedAt &&
                            `· ${new Date(link.updatedAt).toLocaleString()}`}
                        </p>
                        <a
                          href={safeResourceURL(link.url)}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-2 block text-sm break-all text-primary underline"
                        >
                          {link.url}
                        </a>
                        <div className="mt-2 flex gap-2">
                          {(/^magnet:/i.test(link.url) ||
                            is115ShareURL(link.url)) && (
                            <Button
                              size="sm"
                              disabled={!!downloading}
                              onClick={() =>
                                void downloadResource({
                                  url: link.url,
                                  password: link.password,
                                  title:
                                    result.items.find((item) =>
                                      item.links?.some(
                                        (x) => x.url === link.url
                                      )
                                    )?.title ??
                                    lastConfig?.keyword ??
                                    link.note ??
                                    "资源",
                                  media: mediaContext.current.media,
                                })
                              }
                            >
                              {is115ShareURL(link.url)
                                ? "转存到 115"
                                : "115 离线下载"}
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void copy(link.url)}
                          >
                            复制链接
                          </Button>
                          {link.password && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => void copy(link.password!)}
                            >
                              复制提取码：{link.password}
                            </Button>
                          )}
                        </div>
                      </article>
                    ))}
                  </TabsContent>
                ))}
              </Tabs>
            ) : (
              <p className="py-8 text-center text-muted-foreground">
                没有找到资源链接
              </p>
            )}
          </CardContent>
        </Card>
      )}
      {!result && !loading && history.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">
          输入关键词开始搜索；成功搜索后会在此显示最近一次搜索。
        </p>
      )}
    </main>
  )
}
