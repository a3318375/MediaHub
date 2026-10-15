import { getAccessToken } from "./auth-api";

export type LogLevel = "INFO" | "WARN" | "ERROR" | "DEBUG";
export type LogEntry = {
  id: number;
  time: string;
  source: string;
  level: LogLevel;
  message: string;
};

export async function getLogs(
  filters: {
    level?: string;
    source?: string;
    query?: string;
    limit?: number;
  } = {},
) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters))
    if (value) params.set(key, String(value));
  const token = getAccessToken();
  const response = await fetch(`/api/logs?${params}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!response.ok) {
    const error = (await response.json().catch(() => null)) as {
      message?: string;
    } | null;
    throw new Error(error?.message ?? "读取日志失败");
  }
  return (
    (await response.json()) as {
      items: Array<Omit<LogEntry, "time"> & { time: string }>;
    }
  ).items;
}
