// Real HTTP integration against a disposable backend, never the user's database.
// Start the Go server with a fresh MEDIAHUB_DATA_DIR on port 18081 first.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const base = process.env.MEDIAHUB_INTEGRATION_BASE || "http://127.0.0.1:18081";
if (new URL(base).hostname !== "127.0.0.1" || new URL(base).port !== "18081")
  throw new Error(
    "Integration mutations are restricted to the disposable localhost:18081 backend",
  );
const modules = new Map();
async function compile(url) {
  if (modules.has(url.href)) return modules.get(url.href);
  let js = ts.transpileModule(await readFile(url, "utf8"), {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
    },
  }).outputText;
  for (const [original, specifier] of [
    ...js.matchAll(/from\s+["'](\.[^"']+)["']/g),
  ])
    js = js.replace(
      original,
      `from ${JSON.stringify(await compile(new URL(`${specifier}.ts`, url)))}`,
    );
  const data = `data:text/javascript;base64,${Buffer.from(js).toString("base64")}`;
  modules.set(url.href, data);
  return data;
}
const load = async (name) =>
  import(await compile(new URL(`../src/${name}.ts`, import.meta.url)));
const nativeFetch = globalThis.fetch;
globalThis.fetch = (path, init) => nativeFetch(new URL(path, base), init);
const storage = new Map();
globalThis.sessionStorage = { getItem: (k) => storage.get(k) ?? null };
globalThis.localStorage = { getItem: () => null };
globalThis.window = { dispatchEvent: () => true };
const { request, service, discoveryQuery } = await load("lib/media-service");
// The adapters use only getItem. No credentials or session tokens are printed.
const { settingsApi } = await load("lib/settings-api");
const { animeApi, emptyAnimeDraft } = await load("lib/anime-api");
const { downloadApi } = await load("lib/download-api");
const { organizeApi } = await load("lib/organize-api");
const { apiKeysApi } = await load("lib/api-keys-api");
const { getLogs } = await load("lib/logs-api");
const account = "hero-integration";
const password = "HeroUI-integration-only-2026!";
const setup = await request("/api/auth/setup/status");
const auth = await request(
  setup.setupRequired ? "/api/auth/setup" : "/api/auth/login",
  null,
  "POST",
  { account, password },
);
let session = { mode: "live", name: account, token: auth.accessToken };
const persistSession = (s) => {
  session = s;
  storage.set("mediahub.hero.session", JSON.stringify(s));
};
persistSession(session);
let passed = 0,
  failed = 0;
async function check(name, run) {
  try {
    await run();
    console.log(`PASS ${name}`);
    passed++;
  } catch (e) {
    console.log(`FAIL ${name}: ${e.message}`);
    failed++;
  }
}
await check("health and authenticated session", async () => {
  assert.equal((await request("/api/health")).status, "ok");
  assert.equal((await request("/api/auth/me", session)).account, account);
});
await check("settings roundtrip and masked credentials", async () => {
  for (const section of [
    "tmdb",
    "emby",
    "115",
    "pansou",
    "search",
    "organize",
    "notifications",
  ]) {
    const r = await settingsApi.get(section);
    assert.ok(r.values && Array.isArray(r.configuredSecrets));
  }
  const secret = "integration-fixture-secret";
  await settingsApi.save("tmdb", { "tmdb.apiKey": secret });
  let result = await settingsApi.get("tmdb");
  assert.equal(result.values["tmdb.apiKey"], undefined);
  assert.ok(result.configuredSecrets.includes("tmdb.apiKey"));
  assert.equal((await settingsApi.reveal("tmdb", "tmdb.apiKey")).value, secret);
  await settingsApi.save("tmdb", { "tmdb.apiKey": "" });
  assert.equal((await settingsApi.reveal("tmdb", "tmdb.apiKey")).value, secret);
  await request("/api/settings/tmdb", session, "PUT", {
    values: {},
    clearSecrets: ["tmdb.apiKey"],
  });
  await settingsApi.save("search", {
    "search.auto": false,
    "search.quality": "1080p",
  });
  assert.equal((await settingsApi.get("search")).values["search.auto"], false);
});
await check(
  "resource metadata, persisted selection and empty-search envelope",
  async () => {
    const meta = await request("/api/v1/resources/meta", session);
    assert.ok(Array.isArray(meta.data.plugins));
    await settingsApi.save("pansou", {
      "pansou.channels": [],
      "pansou.plugins": [],
      "pansou.cloudTypes": [],
      "pansou.customChannels": [],
      "pansou.detectionEnabled": false,
      "pansou.configVersion": 1,
    });
    const r = await request("/api/v1/resources/meta", session);
    assert.deepEqual(r.data.selection.channels, []);
    assert.deepEqual(r.data.selection.plugins, []);
    await assert.rejects(service(session).search("integration"), /设置/);
  },
);
await check(
  "TV subscription create, update, list, duplicate and delete",
  async () => {
    const api = service(session);
    const draft = {
      source: "tg",
      tmdbId: "95396",
      title: "Integration TV",
      season: 1,
      enabled: false,
      channels: ["integration_channel"],
      match: "1080p",
      exclude: "trailer",
    };
    const created = await api.saveTV(draft);
    assert.ok(created.id);
    assert.ok(Array.isArray(created.resources));
    assert.ok((await api.tv()).some((i) => i.id === created.id));
    const changed = await api.saveTV(
      { ...draft, title: "Updated integration TV" },
      created.id,
    );
    assert.equal(changed.title, "Updated integration TV");
    await assert.rejects(api.saveTV(draft), (e) => e.status === 409);
    await api.removeTV(created.id);
    assert.ok(!(await api.tv()).some((i) => i.id === created.id));
  },
);
await check(
  "anime persistence, empty resource arrays and server validation",
  async () => {
    const items = await animeApi.list();
    assert.ok(Array.isArray(items));
    let fixture = items.find((i) => i.title === "HeroUI integration fixture");
    if (!fixture)
      fixture = await animeApi.create({
        ...emptyAnimeDraft(),
        source: "other",
        bangumiId: "1",
        title: "HeroUI integration fixture",
        url: "https://example.org/hero-integration-feed.xml",
        enabled: false,
        totalEpisodes: 1,
        week: 1,
      });
    assert.ok(fixture.id);
    assert.ok(Array.isArray(fixture.resources));
    const changed = await animeApi.enable(fixture.id, false);
    assert.equal(changed.enabled, false);
    assert.ok(Array.isArray(changed.resources));
    await assert.rejects(animeApi.create(emptyAnimeDraft()), /./);
    await assert.rejects(animeApi.enable("missing", false), /不存在/);
    const downloads = await downloadApi.getAnime(fixture.id);
    assert.equal(typeof downloads.rule.enabled, "boolean");
    assert.ok(Array.isArray(downloads.items));
    await downloadApi.saveAnime(fixture.id, {
      enabled: false,
      directoryId: "library",
      fromEpisode: 2,
    });
    const saved = await downloadApi.getAnime(fixture.id);
    assert.equal(saved.rule.enabled, false);
    assert.equal(saved.rule.directoryId, "library");
    assert.equal(saved.rule.fromEpisode, 2);
  },
);
await check(
  "missing 115 credentials produce actionable 503 responses",
  async () => {
    await assert.rejects(
      request("/api/v1/115/directories?parentId=0", session),
      (e) => e.status === 503 && /115 Cookie/.test(e.message),
    );
    await assert.rejects(
      request("/api/v1/115/share/list", session, "POST", {
        url: "https://115.com/s/abcd",
        receiveCode: "1234",
        directoryId: "0",
      }),
      (e) => e.status === 503 && /115 Cookie/.test(e.message),
    );
  },
);
await check("download list and missing-task lifecycle", async () => {
  assert.ok(Array.isArray((await downloadApi.list()).items));
  await assert.rejects(downloadApi.retry("missing"), /不存在/);
  await assert.rejects(downloadApi.resume("missing"), /不存在/);
  await assert.rejects(downloadApi.cancel("missing"), /不存在/);
});
await check(
  "organize configuration, rules, plans and missing-plan boundary",
  async () => {
    const config = await organizeApi.config();
    assert.equal(config.enabled, false);
    assert.ok(Array.isArray(await organizeApi.rules()));
    assert.ok(Array.isArray(await organizeApi.plans()));
    await assert.rejects(organizeApi.start("missing"), /不存在/);
  },
);
await check("API key authorization boundary and revoke", async () => {
  const { item, key } = await apiKeysApi.create("integration-only");
  assert.ok((await apiKeysApi.list()).some((i) => i.id === item.id));
  const keySession = { ...session, token: key };
  assert.equal(
    (await request("/api/v1/whoami", keySession)).authenticatedBy,
    "apiKey",
  );
  await assert.rejects(
    request("/api/settings/tmdb", keySession),
    (e) => e.status === 401,
  );
  await apiKeysApi.revoke(item.id);
  await assert.rejects(
    request("/api/v1/whoami", keySession),
    (e) => e.status === 401,
  );
});
await check("logs filtering", async () => {
  assert.ok(Array.isArray(await getLogs({ level: "ERROR", limit: 100 })));
});
await check(
  "TMDB discovery parameter normalization reaches credential validation",
  async () => {
    assert.equal(
      discoveryQuery({ source: "tmdb", pageSize: "24" }).pageSize,
      "20",
    );
    await assert.rejects(
      service(session).discover({
        source: "tmdb",
        mediaType: "movie",
        page: "1",
        pageSize: "24",
      }),
      (e) => e.status === 503,
    );
  },
);
await check("account and password changes rotate session", async () => {
  const changed = await request("/api/auth/account", session, "PATCH", {
    account: "hero-integration-updated",
    currentPassword: password,
  });
  assert.equal(changed.account, "hero-integration-updated");
  await request("/api/auth/account", session, "PATCH", {
    account,
    currentPassword: password,
  });
  const old = session;
  const nextPassword = "HeroUI-integration-rotated-2026!";
  let r = await request("/api/auth/password", session, "POST", {
    currentPassword: password,
    newPassword: nextPassword,
  });
  persistSession({ ...session, token: r.accessToken });
  await assert.rejects(request("/api/auth/me", old), (e) => e.status === 401);
  r = await request("/api/auth/password", session, "POST", {
    currentPassword: nextPassword,
    newPassword: password,
  });
  persistSession({ ...session, token: r.accessToken });
  assert.equal((await request("/api/auth/me", session)).account, account);
});
if (process.env.MEDIAHUB_CHECK_UPSTREAMS === "1") {
  await check("live Bangumi discovery and media detail", async () => {
    const api = service(session);
    const page = await api.discover({
      source: "bangumi",
      mediaType: "anime",
      page: "1",
      pageSize: "20",
    });
    assert.ok(page.items.length > 0);
    assert.ok((await api.detail(page.items[0])).title);
  });
  await check(
    "live Mikan catalog, subgroup, RSS resolution and preview",
    async () => {
      const catalog = await animeApi.catalog("葬送的芙莉莲", "", false);
      assert.ok(catalog.items.length > 0, "Mikan returned no catalog matches");
      const item = catalog.items[0];
      const groups = await animeApi.groups(item.id);
      assert.ok(groups.length > 0, "Mikan returned no subgroups");
      // Batch-only BD feeds correctly have no accepted single episodes. Select a
      // subgroup whose public release samples include an episodic title.
      const group = groups.find((g) =>
        (g.items || []).some((i) =>
          /\s-\s\d{1,3}\b|\[\d{1,3}(?:v\d)?\]|第\s*\d+\s*[集话話]|S\d+E\d+/i.test(
            i.title,
          ),
        ),
      );
      assert.ok(group, "Mikan returned no episodic subgroup samples");
      const draft = await animeApi.resolve({
        ...emptyAnimeDraft(),
        title: item.title,
        mikanId: item.id,
        url: group.url,
        bangumiId: group.bangumiId,
        subgroup: group.label,
      });
      assert.ok(draft.bangumiId);
      const preview = await animeApi.preview(draft);
      assert.ok(Array.isArray(preview.items));
      assert.ok(
        preview.items.length > 0,
        "Mikan RSS contained no release entries",
      );
      assert.ok(
        preview.accepted > 0,
        `Mikan RSS entries could not be matched to episodes: ${JSON.stringify(preview.items.slice(0, 3).map((i) => ({ title: i.title, episode: i.episode, reason: i.reason })))}`,
      );
    },
  );
}
await check("logout invalidates session", async () => {
  await request("/api/auth/logout", session, "POST");
  await assert.rejects(
    request("/api/auth/me", session),
    (e) => e.status === 401,
  );
});
console.log(
  `Integration result: ${passed} passed, ${failed} failed (real Go API at ${base})`,
);
process.exitCode = failed ? 1 : 0;
