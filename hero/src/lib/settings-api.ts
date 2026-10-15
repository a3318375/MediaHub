import { getAccessToken } from "./auth-api";
import { RESOURCE_SEARCH_CONFIG_CHANGED } from "./resource-search";

export type SettingValue = string | boolean | number | string[];
export type SettingsSection =
  "tmdb" | "emby" | "115" | "organize" | "search" | "pansou" | "notifications";

export type SettingsResponse = {
  values: Record<string, SettingValue>;
  configuredSecrets: string[];
  maskedSecrets?: Record<string, string>;
};

async function request(
  section: SettingsSection,
  method: "GET" | "PUT",
  body?: unknown,
) {
  const token = getAccessToken();
  const response = await fetch(`/api/settings/${encodeURIComponent(section)}`, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) {
    const error = (await response.json().catch(() => null)) as {
      message?: string;
    } | null;
    throw new Error(error?.message ?? "配置请求失败");
  }
  return response.json() as Promise<SettingsResponse>;
}

export const settingsApi = {
  async reveal(
    section: SettingsSection,
    key: string,
    signal?: AbortSignal,
  ): Promise<{ value: string }> {
    const token = getAccessToken();
    const response = await fetch(
      `/api/settings/${encodeURIComponent(section)}/secrets/reveal`,
      {
        method: "POST",
        signal,
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ key }),
      },
    );
    if (!response.ok) {
      const result = await response.json().catch(() => null);
      throw new Error(result?.message ?? "读取凭证失败");
    }
    return response.json() as Promise<{ value: string }>;
  },
  get(section: SettingsSection) {
    return request(section, "GET");
  },
  async save(section: SettingsSection, values: Record<string, SettingValue>) {
    const result = await request(section, "PUT", { values });
    if (section === "pansou")
      window.dispatchEvent(new Event(RESOURCE_SEARCH_CONFIG_CHANGED));
    return result;
  },
};
