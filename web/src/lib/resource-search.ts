export type ResourceSearchHistoryEntry = {
  kind?: "resource"
  keyword: string
  source: string
  mode: string
  cloudTypes: string[]
  plugins: string[]
  channels: string[]
  at: number
}

export type MediaSearchHistoryEntry = {
  kind: "media"
  keyword: string
  source: string
  at: number
}

type SearchHistoryEntry = ResourceSearchHistoryEntry | MediaSearchHistoryEntry

export const RESOURCE_SEARCH_HISTORY_KEY = "mediahub-search-history"
export const RESOURCE_SEARCH_RESULT_KEY = "mediahub-last-search-result"

export function clearResourceSearchResult(
  storage: Pick<Storage, "removeItem">
) {
  try {
    storage.removeItem(RESOURCE_SEARCH_RESULT_KEY)
  } catch {
    // Storage may be unavailable in private browsing contexts.
  }
}

export function prepareResourceSearch(storage: Pick<Storage, "removeItem">) {
  clearResourceSearchResult(storage)
}

export function chooseSearchSource(
  channels: string[],
  plugins: string[],
  firstRound = false
): "all" | "tg" | "plugin" {
  if (firstRound)
    return channels.length ? "tg" : plugins.length ? "plugin" : "all"
  return channels.length && plugins.length
    ? "all"
    : channels.length
      ? "tg"
      : plugins.length
        ? "plugin"
        : "all"
}

export function readResourceSearchHistory(
  storage: Pick<Storage, "getItem">
): ResourceSearchHistoryEntry[] {
  return readAllSearchHistory(storage).filter(
    (item): item is ResourceSearchHistoryEntry => item.kind !== "media"
  )
}

export function readMediaSearchHistory(
  storage: Pick<Storage, "getItem">
): MediaSearchHistoryEntry[] {
  return readAllSearchHistory(storage).filter(
    (item): item is MediaSearchHistoryEntry => item.kind === "media"
  )
}

function isSearchHistoryEntry(value: unknown): value is SearchHistoryEntry {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false
  const item = value as Record<string, unknown>
  if (
    typeof item.keyword !== "string" ||
    !item.keyword.trim() ||
    typeof item.source !== "string" ||
    typeof item.at !== "number" ||
    !Number.isFinite(item.at)
  )
    return false
  if (item.kind === "media") return true
  if (item.kind !== undefined && item.kind !== "resource") return false
  return (
    typeof item.mode === "string" &&
    [item.cloudTypes, item.plugins, item.channels].every(
      (list) =>
        Array.isArray(list) && list.every((entry) => typeof entry === "string")
    )
  )
}

function readAllSearchHistory(
  storage: Pick<Storage, "getItem">
): SearchHistoryEntry[] {
  try {
    const parsed: unknown = JSON.parse(
      storage.getItem(RESOURCE_SEARCH_HISTORY_KEY) ?? storage.getItem("media-center-search-history") ?? "[]"
    )
    return Array.isArray(parsed) ? parsed.filter(isSearchHistoryEntry) : []
  } catch {
    return []
  }
}

export function saveResourceSearchHistory(
  storage: Pick<Storage, "getItem" | "setItem">,
  entry: ResourceSearchHistoryEntry
): ResourceSearchHistoryEntry[] {
  const normalized = { ...entry, kind: "resource" as const }
  const next = [
    normalized,
    ...readAllSearchHistory(storage).filter(
      (item) => !(item.keyword === entry.keyword && item.kind !== "media")
    ),
  ].slice(0, 20)
  try {
    storage.setItem(RESOURCE_SEARCH_HISTORY_KEY, JSON.stringify(next))
  } catch {
    /* Search remains usable when browser storage is full. */
  }
  return next.filter(
    (item): item is ResourceSearchHistoryEntry => item.kind !== "media"
  )
}

export function saveMediaSearchHistory(
  storage: Pick<Storage, "getItem" | "setItem">,
  entry: MediaSearchHistoryEntry
): MediaSearchHistoryEntry[] {
  const next = [
    entry,
    ...readAllSearchHistory(storage).filter(
      (item) => !(item.keyword === entry.keyword && item.kind === "media")
    ),
  ].slice(0, 20)
  try {
    storage.setItem(RESOURCE_SEARCH_HISTORY_KEY, JSON.stringify(next))
  } catch {
    /* Search remains usable when browser storage is full. */
  }
  return next.filter(
    (item): item is MediaSearchHistoryEntry => item.kind === "media"
  )
}

export const RESOURCE_SEARCH_CONFIG_CHANGED =
  "mediahub-resource-config-changed"

export type ResourceSearchPreferences = {
  channels: string[]
  plugins: string[]
  cloudTypes: string[]
  customChannels: string[]
  detectionEnabled: boolean
}

export type ResourceSearchMeta = {
  defaults: ResourceSearchPreferences
  selection: ResourceSearchPreferences
  channels: string[]
  plugins: { name: string }[]
  cloudTypes: string[]
}

export function resourceSearchPlan(selection: ResourceSearchPreferences) {
  return {
    firstSource: chooseSearchSource(
      selection.channels,
      selection.plugins,
      true
    ),
    fullSource: chooseSearchSource(selection.channels, selection.plugins),
    warmup: selection.channels.length > 0 && selection.plugins.length > 0,
    collect: selection.plugins.length > 0,
    disabled: selection.channels.length === 0 && selection.plugins.length === 0,
  }
}

export function normalizeResourceChannel(input: string): string | null {
  let channel = input.trim().replace(/^@/, "")
  if (/^https?:\/\//i.test(channel)) {
    try {
      const url = new URL(channel)
      if (url.hostname !== "t.me") return null
      channel = url.pathname.replace(/^\/(?:s\/)?/, "").replace(/\/$/, "")
    } catch {
      return null
    }
  }
  return /^[a-zA-Z0-9_]{1,24}$/.test(channel) ? channel : null
}

export function safeResourceURL(value: string): string | undefined {
  try {
    const url = new URL(value)
    if (["http:", "https:", "magnet:", "ed2k:"].includes(url.protocol))
      return value
  } catch {
    /* Invalid or executable links must not be navigable. */
  }
  return undefined
}
