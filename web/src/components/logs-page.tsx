import { useEffect, useMemo, useState } from "react"
import { DownloadIcon, PauseIcon, PlayIcon, SearchIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { getLogs, type LogEntry, type LogLevel } from "@/lib/logs-api"

const levels = ["全部级别", "INFO", "WARN", "ERROR", "DEBUG"] as const
const levelNames = { INFO: "信息", WARN: "提醒", ERROR: "失败", DEBUG: "调试" }
function downloadLogs(logs: LogEntry[]) {
  const content = logs
    .map((log) => `${log.time}\t${log.source}\t${log.level}\t${log.message}`)
    .join("\n")
  const blob = new Blob(["时间\t模块\t级别\t内容\n" + content], {
    type: "text/plain;charset=utf-8",
  })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = "mediahub-logs.txt"
  anchor.click()
  URL.revokeObjectURL(url)
}

function levelVariant(level: LogLevel) {
  if (level === "ERROR") return "destructive" as const
  if (level === "WARN") return "outline" as const
  return "secondary" as const
}

export function LogsPage() {
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [level, setLevel] = useState<(typeof levels)[number]>("全部级别")
  const [source, setSource] = useState("全部模块")
  const [query, setQuery] = useState("")
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [error, setError] = useState("")

  useEffect(() => {
    let active = true
    let interval: number | undefined
    const load = () => {
      void getLogs({
        level: level === "全部级别" ? undefined : level,
        source: source === "全部模块" ? undefined : source,
        query,
        limit: 500,
      })
        .then((items) => {
          if (active) {
            setLogs(items)
            setError("")
          }
        })
        .catch((reason) => {
          if (active)
            setError(reason instanceof Error ? reason.message : "读取日志失败")
        })
    }
    const initial = window.setTimeout(() => {
      load()
      if (autoRefresh) interval = window.setInterval(load, 5000)
    }, 200)
    return () => {
      active = false
      window.clearTimeout(initial)
      if (interval) window.clearInterval(interval)
    }
  }, [autoRefresh, level, query, source])

  const sources = useMemo(
    () => ["全部模块", ...new Set(logs.map((log) => log.source))],
    [logs]
  )

  const visibleLogs = logs

  return (
    <div className="flex flex-col gap-4 p-4 sm:gap-5 sm:p-6 lg:p-7">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm text-muted-foreground">
            订阅、刷新、下载、转存与整理记录。
          </p>
        </div>
        <Badge variant="outline">业务日志 · {visibleLogs.length} 条</Badge>
      </div>

      <Card className="border-border/70 shadow-none">
        <CardContent className="flex flex-col gap-3 p-3 sm:p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant={autoRefresh ? "outline" : "default"}
              onClick={() => setAutoRefresh((value) => !value)}
            >
              {autoRefresh ? (
                <PauseIcon data-icon="inline-start" />
              ) : (
                <PlayIcon data-icon="inline-start" />
              )}
              {autoRefresh ? "暂停自动刷新" : "恢复自动刷新"}
            </Button>
            <Button onClick={() => downloadLogs(visibleLogs)}>
              <DownloadIcon data-icon="inline-start" />
              下载日志
            </Button>
            <div className="ml-auto flex w-full flex-wrap items-center gap-2 sm:w-auto">
              <Select
                value={level}
                onValueChange={(value) => {
                  if (value) setLevel(value as (typeof levels)[number])
                }}
              >
                <SelectTrigger className="h-9 w-32" aria-label="日志级别">
                  <SelectValue>
                    {level === "全部级别" ? level : levelNames[level]}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {levels.map((item) => (
                      <SelectItem key={item} value={item}>
                        {item === "全部级别" ? item : levelNames[item]}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <Select
                value={source}
                onValueChange={(value) => {
                  if (value) setSource(value)
                }}
              >
                <SelectTrigger className="h-9 w-44" aria-label="日志模块">
                  <SelectValue>{source}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {sources.map((item) => (
                      <SelectItem key={item} value={item}>
                        {item}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <div className="relative min-w-44 flex-1 sm:w-56 sm:flex-none">
                <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  aria-label="搜索日志"
                  placeholder="搜索日志内容"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  className="h-9 pl-9"
                />
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 border-t pt-3 text-xs text-muted-foreground">
            <span
              className={`size-2 rounded-full ${autoRefresh ? "bg-emerald-500" : "bg-muted-foreground/50"}`}
            />
            自动刷新{autoRefresh ? "已开启" : "已暂停"} · SQLite 保留最近 5000
            条记录
          </div>
        </CardContent>
      </Card>

      <Card className="min-h-0 flex-1 border-border/70">
        <CardContent className="p-2 sm:p-3">
          {error && (
            <p
              role="alert"
              className="mb-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive"
            >
              {error}
            </p>
          )}
          <div
            className="max-h-[calc(100svh-290px)] min-h-80 overflow-auto rounded-lg border bg-background px-2 sm:px-3"
            role="log"
            aria-label="服务日志列表"
            aria-live="off"
          >
            {visibleLogs.length ? (
              visibleLogs.map((log) => (
                <div
                  key={log.id}
                  className="grid min-h-9 grid-cols-[72px_112px_58px_minmax(0,1fr)] items-center gap-2 border-b last:border-b-0 sm:grid-cols-[74px_132px_64px_minmax(0,1fr)] sm:gap-2.5"
                >
                  <time className="font-mono text-[11px] text-muted-foreground">
                    {Number.isNaN(Date.parse(log.time))
                      ? log.time
                      : new Date(log.time).toLocaleTimeString("zh-CN", {
                          hour12: false,
                        })}
                  </time>
                  <Badge
                    variant="secondary"
                    className="max-w-full justify-center truncate px-2 text-[10px] font-medium"
                  >
                    {log.source}
                  </Badge>
                  <Badge
                    variant={levelVariant(log.level)}
                    className="justify-center px-1.5 text-[10px]"
                  >
                    {levelNames[log.level]}
                  </Badge>
                  <p
                    className="min-w-0 truncate font-mono text-xs"
                    title={log.message}
                  >
                    {log.message}
                  </p>
                </div>
              ))
            ) : (
              <div className="flex min-h-80 items-center justify-center text-sm text-muted-foreground">
                没有符合条件的日志
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
