import { http, HttpResponse, passthrough } from "msw"

import type { AuthUser } from "@/lib/auth-api"
import { animeSubscriptions as initialAnimeSubscriptions } from "@/mocks/data/anime-subscriptions"
import { continueWatching, embyLibraries, embySites, embyStats, recentlyAdded } from "@/mocks/data/emby-dashboard"
import type { AnimeSubscriptionStatus } from "@/mocks/data/anime-subscriptions"
import { mockLogs } from "@/mocks/data/logs"

const DEMO_ACCOUNT = "admin"
let demoPassword = "123456"
let demoToken = "frame-demo-access-token"
let demoAPIKeys: Array<{ id: string; name: string; prefix: string; createdAt: string; lastUsedAt: string | null; revokedAt: string | null; key: string }> = []
const demoSettings: Record<string, Record<string, unknown>> = {}
const configuredSecrets = new Set<string>()
const demoSecretValues: Record<string,string> = {}
function publicDemoSettings(section: string) {
 const keys=[...configuredSecrets].filter(key => key.startsWith(`${section}.`))
 const maskedSecrets=Object.fromEntries(keys.map(key => {
  const chars=Array.from(demoSecretValues[key]??"")
  const mask=chars.length<=2 ? "••••••••" : chars.length<=8 ? chars[0]+"••••••••"+chars.at(-1) : chars.slice(0,4).join("")+"••••••••"+chars.slice(-4).join("")
  return [key,mask]
 }))
 return {values:demoSettings[section]??{},configuredSecrets:keys,maskedSecrets}
}
const useBackendAuth = import.meta.env.VITE_BACKEND_AUTH === "true"
const animeSubscriptions = structuredClone(initialAnimeSubscriptions)

function publicDemoAPIKey(item: { id: string; name: string; prefix: string; createdAt: string; lastUsedAt: string | null; revokedAt: string | null }) {
  return { id: item.id, name: item.name, prefix: item.prefix, createdAt: item.createdAt, lastUsedAt: item.lastUsedAt, revokedAt: item.revokedAt }
}

const demoUser: AuthUser = {
  id: "user-1",
  account: DEMO_ACCOUNT,
  name: "媒体管理员",
  email: "admin@frame.local",
  avatar: "",
}

function hasDemoToken(request: Request) {
	return request.headers.get("Authorization") === `Bearer ${demoToken}`
}

export const handlers = [
  http.post("/api/settings/:section/secrets/reveal", async ({params,request}) => {
    if(useBackendAuth || params.section === "tmdb") return passthrough()
    if(!hasDemoToken(request)) return HttpResponse.json({message:"请先登录"},{status:401})
    const body=await request.json() as {key?:string}
    if(typeof body.key!=="string" || !body.key.startsWith(`${params.section}.`) || !["emby.apiKey","115.cookie","notifications.botToken","notifications.webhookSecret"].includes(body.key)) return HttpResponse.json({message:"凭证字段无效"},{status:400})
    if(!configuredSecrets.has(body.key)) return HttpResponse.json({message:"该凭证尚未保存"},{status:404})
    return HttpResponse.json({value:demoSecretValues[body.key]},{headers:{"Cache-Control":"no-store"}})
  }),
  http.get("/api/logs", ({ request }) => {
    if (useBackendAuth) return passthrough()
    const url = new URL(request.url)
    const level = url.searchParams.get("level")
    const source = url.searchParams.get("source")
    const query = url.searchParams.get("query")?.toLocaleLowerCase()
    const items = mockLogs.filter((item) => (!level || item.level === level) && (!source || item.source === source) && (!query || `${item.source} ${item.message}`.toLocaleLowerCase().includes(query))).slice(-Number(url.searchParams.get("limit") ?? 200)).reverse()
    return HttpResponse.json({ items })
  }),
  http.get("/api/subscriptions/anime", () => HttpResponse.json(animeSubscriptions)),
  http.patch("/api/subscriptions/anime/:id", async ({ params, request }) => {
    const patch = await request.json() as { status?: AnimeSubscriptionStatus }
    const index = animeSubscriptions.findIndex((item) => item.id === params.id)
    const current = animeSubscriptions[index]
    if (!current) return HttpResponse.json({ message: "订阅不存在" }, { status: 404 })
    animeSubscriptions[index] = { ...current, ...patch }
    return HttpResponse.json(animeSubscriptions[index])
  }),
  http.get("/api/emby/dashboard", () => useBackendAuth ? passthrough() : HttpResponse.json({ updatedAt: new Date().toISOString(), warnings: [], sites: embySites, stats: embyStats, libraries: embyLibraries, recentlyAdded, continueWatching })),
  http.get("/api/settings/:section", ({ params }) => useBackendAuth || params.section === "tmdb" ? passthrough() : HttpResponse.json(publicDemoSettings(params.section as string))),
  http.put("/api/settings/:section", async ({ params, request }) => {
    if (useBackendAuth || params.section === "tmdb") return passthrough()
    const section = params.section as string
    const body = await request.json() as { values?: Record<string, unknown>; clearSecrets?: string[] }
    const values = demoSettings[section] ?? (demoSettings[section] = {})
    for (const [key, value] of Object.entries(body.values ?? {})) {
      if (["emby.apiKey", "115.cookie", "notifications.botToken"].includes(key)) {
        if (typeof value === "string" && value) { configuredSecrets.add(key); demoSecretValues[key]=value; values[key] = "" }
      } else values[key] = value
    }
    for (const key of body.clearSecrets ?? []) { configuredSecrets.delete(key); delete demoSecretValues[key]; delete values[key] }
    return HttpResponse.json(publicDemoSettings(section))
  }),
  http.get("/api/auth/api-keys", () => useBackendAuth ? passthrough() : HttpResponse.json({ items: demoAPIKeys.map(publicDemoAPIKey) })),
  http.post("/api/auth/api-keys", async ({ request }) => {
    if (useBackendAuth) return passthrough()
    const body = await request.json() as { name?: string }
    const key = `mc_demo_${crypto.randomUUID().replaceAll("-", "")}`
    const item = { id: crypto.randomUUID(), name: body.name?.trim() ?? "", prefix: key.slice(0, 11), createdAt: new Date().toISOString(), lastUsedAt: null, revokedAt: null, key }
    demoAPIKeys = [item, ...demoAPIKeys]
    return HttpResponse.json({ item: publicDemoAPIKey(item), key }, { status: 201 })
  }),
  http.delete("/api/auth/api-keys/:id", ({ params }) => {
    if (useBackendAuth) return passthrough()
    demoAPIKeys = demoAPIKeys.map((item) => item.id === params.id ? { ...item, revokedAt: new Date().toISOString() } : item)
    return new HttpResponse(null, { status: 204 })
  }),
  http.get("/api/v1/whoami", ({ request }) => {
    if (useBackendAuth) return passthrough()
    const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "")
    const key = demoAPIKeys.find((item) => item.key === token && !item.revokedAt)
    if (key) return HttpResponse.json({ user: demoUser, authenticatedBy: "apiKey" })
    if (hasDemoToken(request)) return HttpResponse.json({ user: demoUser, authenticatedBy: "session" })
    return HttpResponse.json({ message: "API Key 无效或已撤销" }, { status: 401 })
  }),
  http.get("/api/auth/setup/status", () => useBackendAuth ? passthrough() : HttpResponse.json({ setupRequired: false })),
  http.post("/api/auth/login", async ({ request }) => {
    if (useBackendAuth) return passthrough()
    const body = (await request.json().catch(() => null)) as
      | { account?: string; password?: string }
      | null

    if (body?.account !== demoUser.account || body.password !== demoPassword) {
      return HttpResponse.json(
        { message: "账号或密码不正确。" },
        { status: 401 }
      )
    }

    return HttpResponse.json({ accessToken: demoToken, user: demoUser })
  }),

  http.get("/api/auth/me", ({ request }) => {
    if (useBackendAuth) return passthrough()
    if (!hasDemoToken(request)) {
      return HttpResponse.json(
        { message: "当前未登录。" },
        { status: 401 }
      )
    }

    return HttpResponse.json(demoUser)
  }),

  http.patch("/api/auth/account", async ({ request }) => {
    if (useBackendAuth) return passthrough()
    if (!hasDemoToken(request)) return HttpResponse.json({ message: "当前未登录。" }, { status: 401 })
    const body = await request.json() as { account?: string; currentPassword?: string }
    if (body.currentPassword !== demoPassword) return HttpResponse.json({ message: "当前密码不正确。" }, { status: 401 })
    demoUser.account = body.account ?? demoUser.account
    return HttpResponse.json(demoUser)
  }),

  http.post("/api/auth/password", async ({ request }) => {
    if (useBackendAuth) return passthrough()
    if (!hasDemoToken(request)) return HttpResponse.json({ message: "当前未登录。" }, { status: 401 })
    const body = await request.json() as { currentPassword?: string; newPassword?: string }
    if (body.currentPassword !== demoPassword || !body.newPassword) return HttpResponse.json({ message: "当前密码不正确或新密码无效。" }, { status: 400 })
    demoPassword = body.newPassword
    demoToken = `${demoToken}-renewed`
    return HttpResponse.json({ accessToken: demoToken, user: demoUser })
  }),

  http.post("/api/auth/logout", ({ request }) => {
    if (useBackendAuth) return passthrough()
    if (!hasDemoToken(request)) {
      return HttpResponse.json(
        { message: "当前未登录。" },
        { status: 401 }
      )
    }

    return new HttpResponse(null, { status: 204 })
  }),
]
