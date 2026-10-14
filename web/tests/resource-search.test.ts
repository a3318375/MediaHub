import assert from "node:assert/strict"
import test from "node:test"
import {
  chooseSearchSource,
  resourceSearchPlan,
  normalizeResourceChannel,
  safeResourceURL,
  readResourceSearchHistory,
  readMediaSearchHistory,
  RESOURCE_SEARCH_HISTORY_KEY,
  saveResourceSearchHistory,
} from "../src/lib/resource-search.ts"

function memoryStorage() {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  }
}

test("历史记录过滤合法 JSON 中的坏条目，保留旧格式资源与媒体历史", () => {
  const storage = memoryStorage()
  const resource = {
    keyword: "作品",
    source: "all",
    mode: "merge",
    cloudTypes: [],
    plugins: [],
    channels: [],
    at: 1,
  }
  const media = { kind: "media", keyword: "动漫", source: "bangumi", at: 2 }
  storage.setItem(
    RESOURCE_SEARCH_HISTORY_KEY,
    JSON.stringify([
      null,
      3,
      "bad",
      [],
      {},
      { ...resource, keyword: " " },
      { ...resource, at: "1" },
      { ...resource, channels: [null] },
      { ...resource, plugins: null },
      { ...resource, kind: "unknown" },
      resource,
      media,
    ])
  )
  assert.deepEqual(readResourceSearchHistory(storage), [resource])
  assert.deepEqual(readMediaSearchHistory(storage), [media])
  assert.equal(
    saveResourceSearchHistory(storage, { ...resource, keyword: "新作品" })
      .length,
    2
  )
  assert.deepEqual(readMediaSearchHistory(storage), [media])
})

test("首轮与后续轮次按 PanSou 规则选择来源", () => {
  assert.equal(chooseSearchSource(["tg"], ["plugin"], true), "tg")
  assert.equal(chooseSearchSource([], ["plugin"], true), "plugin")
  assert.equal(chooseSearchSource([], [], true), "all")
  assert.equal(chooseSearchSource(["tg"], ["plugin"]), "all")
  assert.equal(chooseSearchSource(["tg"], []), "tg")
})

test("历史记录损坏回空，保存时同关键词置顶并最多保留 20 条", () => {
  const storage = memoryStorage()
  storage.setItem(RESOURCE_SEARCH_HISTORY_KEY, "not-json")
  assert.deepEqual(readResourceSearchHistory(storage), [])
  const entry = (keyword: string) => ({
    keyword,
    source: "all",
    mode: "merge",
    cloudTypes: [],
    plugins: [],
    channels: [],
    at: 1,
  })
  for (let index = 0; index < 21; index += 1)
    saveResourceSearchHistory(storage, entry(`电影${index}`))
  const next = saveResourceSearchHistory(storage, entry("电影10"))
  assert.equal(next.length, 20)
  assert.equal(next[0].keyword, "电影10")
  assert.equal(next.filter((item) => item.keyword === "电影10").length, 1)
})

test("保存的来源选择决定首轮、预热和收集，清空来源不自动重启全部", () => {
  const base = {
    channels: ["channel"],
    plugins: ["huban"],
    cloudTypes: ["quark"],
    customChannels: [],
    detectionEnabled: false,
  }
  assert.deepEqual(resourceSearchPlan(base), {
    firstSource: "tg",
    fullSource: "all",
    warmup: true,
    collect: true,
    disabled: false,
  })
  assert.deepEqual(resourceSearchPlan({ ...base, channels: [] }), {
    firstSource: "plugin",
    fullSource: "plugin",
    warmup: false,
    collect: true,
    disabled: false,
  })
  assert.deepEqual(resourceSearchPlan({ ...base, plugins: [] }), {
    firstSource: "tg",
    fullSource: "tg",
    warmup: false,
    collect: false,
    disabled: false,
  })
  assert.equal(
    resourceSearchPlan({ ...base, channels: [], plugins: [] }).disabled,
    true
  )
})

test("频道输入支持名称和 Telegram 链接，拒绝其他网站和非法路径", () => {
  assert.equal(normalizeResourceChannel(" @channel_name "), "channel_name")
  assert.equal(
    normalizeResourceChannel("https://t.me/s/channel_name"),
    "channel_name"
  )
  assert.equal(
    normalizeResourceChannel("https://evil.example/channel_name"),
    null
  )
  assert.equal(normalizeResourceChannel("https://t.me/../private"), "private")
  assert.equal(normalizeResourceChannel("../../private"), null)
})

test("搜索结果允许网盘和磁力链接，拒绝可执行协议", () => {
  assert.equal(
    safeResourceURL("https://pan.quark.cn/s/a"),
    "https://pan.quark.cn/s/a"
  )
  assert.equal(
    safeResourceURL("magnet:?xt=urn:btih:abc"),
    "magnet:?xt=urn:btih:abc"
  )
  assert.equal(safeResourceURL("javascript:alert(1)"), undefined)
  assert.equal(safeResourceURL("data:text/html,evil"), undefined)
})

test("浏览器存储不可写时仍返回新搜索历史", () => {
  const storage = {
    getItem: () => null,
    setItem: () => {
      throw new Error("quota")
    },
  }
  const result = saveResourceSearchHistory(storage, {
    keyword: "test",
    source: "all",
    mode: "merge",
    cloudTypes: [],
    channels: [],
    plugins: [],
    at: 1,
  })
  assert.equal(result[0].keyword, "test")
})
