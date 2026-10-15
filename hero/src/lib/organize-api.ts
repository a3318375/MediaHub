import { getAccessToken } from "./auth-api";
import type { DownloadFile,DownloadMediaContext } from "./download-api";

export type OrganizeRule = {
  id: string;
  name: string;
  sourceId: string;
  movieTargetId: string;
  tvTargetId: string;
  animeTargetId: string;
  programTargetId: string;
  dailyAt: string;
  enabled: boolean;
  recursive: boolean;
  allowExisting: boolean;
  typeHint: string;
  keepQuality: boolean;
  keepSubgroup: boolean;
  binding?: DownloadMediaContext;
};
export type OrganizePlan = {
  id: string;
  rule: OrganizeRule;
  state: string;
  mode: string;
  createdAt: string;
  error?: string;
  actions: {
    id: string;
    source: DownloadFile;
    targetRootId: string;
    targetDirectories: string[];
    targetName: string;
    state: string;
    error?: string;
  }[];
  issues: { file: DownloadFile; code: string; message: string }[];
};
async function request<T>(
  path: string,
  method = "GET",
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const token = getAccessToken();
  const response = await fetch(`/api/v1/organize/${path}`, {
    method,
    signal,
    cache: "no-store",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok) throw new Error(result?.message ?? "整理服务请求失败");
  return result as T;
}
export const organizeApi = {
  config: (signal?: AbortSignal) =>
    request<{
      id?: string;
      sourceId: string;
      targetId: string;
      cron: string;
      enabled: boolean;
      scheduleError?: string;
    }>("config", "GET", undefined, signal),
  saveConfig: (config: {
    sourceId: string;
    targetId: string;
    cron: string;
    enabled: boolean;
  }) =>
    request<{
      id: string;
      sourceId: string;
      targetId: string;
      cron: string;
      enabled: boolean;
      scheduleError?: string;
    }>("config", "PUT", config),
  rules: (signal?: AbortSignal) =>
    request<OrganizeRule[]>("rules", "GET", undefined, signal),
  plans: (signal?: AbortSignal) =>
    request<OrganizePlan[]>("plans", "GET", undefined, signal),
  save: (rule: OrganizeRule) => request<OrganizeRule>("rules", "POST", rule),
  preview: (id: string) =>
    request<OrganizePlan>(`rules/${encodeURIComponent(id)}/preview`, "POST"),
  start: (id: string) =>
    request<OrganizePlan>(`plans/${encodeURIComponent(id)}/start`, "POST"),
  bind: (id: string, media: DownloadMediaContext, ready: boolean) =>
    request(`files/${encodeURIComponent(id)}/binding`, "POST", {
      media,
      ready,
    }),
};
