import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const modules = new Map();
async function compile(path) {
  if (modules.has(path)) return modules.get(path);
  const source = await readFile(new URL(path, import.meta.url), "utf8");
  let js = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
    },
  }).outputText;
  const dependencies = [...js.matchAll(/from\s+["'](\.[^"']+)["']/g)];
  for (const [original, specifier] of dependencies) {
    const resolved = new URL(`${specifier}.ts`, new URL(path, import.meta.url));
    const relative = resolved.href.slice(
      new URL("../", import.meta.url).href.length,
    );
    const url = await compile(`../${relative}`);
    js = js.replace(original, `from ${JSON.stringify(url)}`);
  }
  const result = `data:text/javascript;base64,${Buffer.from(js).toString("base64")}`;
  modules.set(path, result);
  return result;
}
const load = async (path) => import(await compile(`../src/lib/${path}.ts`));
const { animeApi, emptyAnimeDraft, normalizeAnime } = await load("anime-api");
const { downloadApi, directoryIdFromInput, is115ShareURL } =
  await load("download-api");
const { organizeApi } = await load("organize-api");
const { apiKeysApi } = await load("api-keys-api");
const { settingsApi } = await load("settings-api");
const { getLogs } = await load("logs-api");
const fetchOriginal = globalThis.fetch;
const storage = new Map();
globalThis.sessionStorage = { getItem: (k) => storage.get(k) ?? null };
globalThis.localStorage = { getItem: () => null };
globalThis.window = { dispatchEvent: () => true };
afterEach(() => {
  globalThis.fetch = fetchOriginal;
  storage.clear();
});

function fixture(result) {
  storage.set(
    "mediahub.hero.session",
    JSON.stringify({ mode: "live", name: "test", token: "test-token" }),
  );
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    assert.equal(init.headers.Authorization, "Bearer test-token");
    calls.push({
      url: String(url),
      method: init.method ?? "GET",
      body: init.body ? JSON.parse(init.body) : undefined,
    });
    return Response.json(result);
  };
  return calls;
}

test("migrated adapters refuse demo sessions before sending network requests", async () => {
  storage.set(
    "mediahub.hero.session",
    JSON.stringify({ mode: "demo", name: "demo" }),
  );
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    throw Error("unexpected network request");
  };
  for (const run of [
    () => animeApi.list(),
    () => downloadApi.list(),
    () => organizeApi.rules(),
    () => settingsApi.get("tmdb"),
    () => apiKeysApi.list(),
    () => getLogs(),
  ]) {
    await assert.rejects(async () => run(), /请连接 MediaHub 服务/);
  }
  assert.equal(calls, 0);
});
test("anime source catalog, matching, preview, subscriptions and automatic download preserve the API contract", async () => {
  const calls = fixture({ items: [], seasons: [], rule: {}, count: 0 });
  const draft = {
    ...emptyAnimeDraft(),
    title: "测试番剧",
    url: "https://example.org/feed.xml",
    match: ["1080p"],
    standby: [
      { label: "备用", url: "https://example.org/backup.xml", offset: 1 },
    ],
  };
  await animeApi.catalog("测试", "2026 秋", false);
  await animeApi.groups("123");
  await animeApi.resolve(draft);
  await animeApi.preview(draft);
  await animeApi.create(draft);
  await animeApi.enable("a/b", false);
  await animeApi.refresh("a/b");
  await downloadApi.saveAnime("a/b", {
    enabled: true,
    directoryId: "123",
    fromEpisode: 2,
  });
  assert.match(calls[0].url, /year=2026&season=/);
  assert.equal(calls[2].url, "/api/v1/subscriptions/anime/resolve");
  assert.deepEqual(calls[4].body.standby, draft.standby);
  assert.deepEqual(calls[5], {
    url: "/api/v1/subscriptions/anime/a%2Fb",
    method: "PATCH",
    body: { enabled: false },
  });
  assert.equal(calls[7].method, "PUT");
  assert.equal(calls[7].body.fromEpisode, 2);
});
test("share transfer preserves selected directory, files, receive code and media binding", async () => {
  const calls = fixture({ items: [], task: { id: "task" } });
  await downloadApi.shareFiles("https://115.com/s/abcd", "1234", "folder");
  const body = {
    kind: "share_transfer",
    url: "https://115.com/s/abcd",
    directoryId: "123",
    wholeShare: false,
    sourceDirectoryId: "folder",
    fileIds: ["file-1"],
    receiveCode: "1234",
    reference: {
      source: "tv_subscription",
      sourceId: "sub",
      media: {
        type: "tv",
        provider: "tmdb",
        providerId: "10",
        season: 2,
        episodes: [3],
      },
    },
  };
  await downloadApi.create(body);
  await downloadApi.cancel("task");
  await downloadApi.resume("task");
  await downloadApi.retry("task");
  assert.deepEqual(calls[1].body, body);
  assert.deepEqual(
    calls.slice(2).map((c) => c.url),
    [
      "/api/v1/downloads/task/cancel",
      "/api/v1/downloads/task/resume",
      "/api/v1/downloads/task/retry",
    ],
  );
});
test("directory and share validation reject root, executable URLs and lookalike hosts", () => {
  assert.equal(directoryIdFromInput("https://115.com/?cid=123"), "123");
  for (const value of [
    "0",
    "-1",
    "javascript:alert(1)",
    "https://115.com.evil.test/?cid=123",
  ])
    assert.throws(() => directoryIdFromInput(value));
  assert.equal(is115ShareURL("https://115.com/s/abcd"), true);
  for (const url of [
    "https://115.com.evil.test/s/abcd",
    "https://evil@115.com/s/abcd",
    "https://115.com/s/abcd/other",
  ])
    assert.equal(is115ShareURL(url), false);
});
test("organize previews require a separate explicit start and file binding retains episode data", async () => {
  const calls = fixture({});
  await organizeApi.saveConfig({
    sourceId: "123",
    targetId: "456",
    cron: "0 3 * * *",
    enabled: true,
  });
  await organizeApi.preview("rule/1");
  assert.equal(calls.length, 2);
  await organizeApi.start("plan/1");
  await organizeApi.bind(
    "file/1",
    { type: "tv", title: "剧集", season: 1, episodes: [2] },
    true,
  );
  assert.equal(calls[1].url, "/api/v1/organize/rules/rule%2F1/preview");
  assert.equal(calls[2].url, "/api/v1/organize/plans/plan%2F1/start");
  assert.deepEqual(calls[3].body.media.episodes, [2]);
});
test("settings, secret reveal, key revocation and log filters use administrator authentication", async () => {
  const calls = fixture({ items: [], value: "fixture" });
  await settingsApi.save("pansou", {
    "pansou.channels": ["public_channel"],
    "pansou.plugins": [],
    "pansou.cloudTypes": ["115"],
    "pansou.configVersion": 1,
  });
  await settingsApi.reveal("115", "115.cookie");
  await apiKeysApi.create("integration");
  await apiKeysApi.revoke("key/1");
  await getLogs({
    level: "ERROR",
    source: "download",
    query: "失败",
    limit: 100,
  });
  assert.equal(calls[0].method, "PUT");
  assert.deepEqual(calls[1].body, { key: "115.cookie" });
  assert.deepEqual(calls[2].body, { name: "integration" });
  assert.equal(calls[3].method, "DELETE");
  assert.match(calls[4].url, /level=ERROR&source=download&query=/);
});
test("backend validation failures are surfaced instead of reported as successful mutations", async () => {
  fixture({});
  globalThis.fetch = async () =>
    Response.json({ message: "配置无效" }, { status: 422 });
  await assert.rejects(
    settingsApi.save("115", { "115.cookie": "fixture" }),
    /配置无效/,
  );
  await assert.rejects(downloadApi.retry("task"), /配置无效/);
  await assert.rejects(organizeApi.start("plan"), /配置无效/);
});

test("Go null collection fields normalize before subscription rendering", () => {
  const result = normalizeAnime({
    ...emptyAnimeDraft(),
    resources: null,
    knownEpisodes: null,
    match: null,
    exclude: null,
    standby: null,
  });
  for (const field of [
    "resources",
    "knownEpisodes",
    "match",
    "exclude",
    "standby",
  ])
    assert.deepEqual(result[field], []);
});
