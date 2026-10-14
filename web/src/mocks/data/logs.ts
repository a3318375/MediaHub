export type LogLevel = "INFO" | "WARN" | "ERROR" | "DEBUG"

export type LogEntry = {
  id: number
  time: string
  source: string
  level: LogLevel
  message: string
}

const messages = [
  ["tgtto115", "INFO", "检查第 17 条消息（ID: 11677）"],
  ["tgtto115", "INFO", "已找到最后处理的消息，停止翻页"],
  ["tgtto115", "INFO", "消息已处理，跳过"],
  ["tgtto115", "INFO", "当前页最后消息 ID: 11674"],
  ["tgtto115", "INFO", "频道发现新的分享链接，已加入待处理队列"],
  ["tgtto115", "WARN", "请求响应较慢，将在下一轮重试"],
  ["__mp_main__", "INFO", "后台任务进入空闲状态"],
  ["telethon.client.updates", "DEBUG", "收到一条新的频道更新"],
  ["organizer", "INFO", "媒体信息扫描完成，共检查 12 个项目"],
  ["rss.worker", "ERROR", "订阅源暂时不可用，稍后将自动重试"],
] as const

const baseTime = new Date("2026-10-10T17:09:18+08:00")

export const mockLogs: LogEntry[] = Array.from({ length: 48 }, (_, index) => {
  const [source, level, message] = messages[index % messages.length]
  const timestamp = new Date(baseTime.getTime() - (47 - index) * 1000)
  return {
    id: index + 1,
    time: timestamp.toLocaleTimeString("zh-CN", { hour12: false }),
    source,
    level,
    message,
  }
})
