import { getAccessToken } from "./auth-api";

export type APIKeyInfo = {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
};

async function request(path: string, init: RequestInit = {}) {
  const token = getAccessToken();
  const response = await fetch(`/api/auth/api-keys${path}`, {
    ...init,
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });
  if (!response.ok) {
    const error = (await response.json().catch(() => null)) as {
      message?: string;
    } | null;
    throw new Error(error?.message ?? "API Key 请求失败");
  }
  return response.status === 204 ? null : (response.json() as Promise<unknown>);
}

export const apiKeysApi = {
  async list() {
    const result = (await request("")) as { items: APIKeyInfo[] };
    return result.items;
  },
  async create(name: string) {
    return (await request("", {
      method: "POST",
      body: JSON.stringify({ name }),
    })) as { item: APIKeyInfo; key: string };
  },
  revoke(id: string) {
    return request(`/${encodeURIComponent(id)}`, { method: "DELETE" });
  },
};
