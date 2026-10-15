import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

// Compile only the adapter into memory; no browser or running backend is needed.
const source = await readFile(
  new URL("../src/lib/media-service.ts", import.meta.url),
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
  },
}).outputText;
const api = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
);
const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
  api.clearCache();
});

test("cache shares concurrent work, expires and honors explicit refresh", async () => {
  let calls = 0;
  const load = async () => ++calls;
  assert.deepEqual(
    await Promise.all([api.cached("a", load), api.cached("a", load)]),
    [1, 1],
  );
  assert.equal(await api.cached("a", load), 1);
  assert.equal(await api.cached("a", load, true), 2);
  await api.cached("expired", load, false, -1);
  assert.equal(await api.cached("expired", load), 4);
});
test("logout invalidation prevents in-flight responses from restoring old cache", async () => {
  let finish;
  const old = api.cached(
    "private",
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  api.clearCache();
  assert.equal(
    await api.cached("private", async () => "new-session"),
    "new-session",
  );
  finish("old-session");
  await old;
  assert.equal(
    await api.cached("private", async () => "unexpected"),
    "new-session",
  );
});
test("failed requests are retriable and cache has a finite bound", async () => {
  await assert.rejects(
    api.cached("failure", async () => {
      throw new Error("offline");
    }),
    /offline/,
  );
  assert.equal(
    await api.cached("failure", async () => "recovered"),
    "recovered",
  );
  for (let i = 0; i < 81; i++) await api.cached(`entry-${i}`, async () => i);
  assert.equal(await api.cached("entry-0", async () => "evicted"), "evicted");
});
test("live authorization failures remain failures rather than returning demo media", async () => {
  globalThis.fetch = async (_url, init) => {
    assert.equal(init.headers.Authorization, "Bearer test-only");
    return Response.json({ message: "登录已过期" }, { status: 401 });
  };
  await assert.rejects(
    api
      .service({ mode: "live", name: "test", token: "test-only" })
      .ranking("tmdb", "movie_day"),
    (e) => e.status === 401 && e.message === "登录已过期",
  );
});
test("ranking keys distinguish sources and unavailable upstream charts are explicit", async () => {
  const paths = [];
  globalThis.fetch = async (url) => {
    paths.push(String(url));
    return Response.json({
      rankings: [
        { supported: true, available: false, message: "来源暂不可用" },
      ],
    });
  };
  const live = api.service({ mode: "live", name: "test", token: "test-only" });
  await assert.rejects(live.ranking("douban", "movie_top250"), /来源暂不可用/);
  await assert.rejects(live.ranking("tmdb", "movie_top"), /来源暂不可用/);
  assert.ok(paths[0].includes("source=douban&name=movie_top250"));
  assert.ok(paths[1].includes("source=tmdb&name=movie_top"));
});
test("resource search follows selected TG/plugin sources and unwraps the Go envelope", async () => {
  globalThis.fetch = async (url, init) => {
    if (String(url).endsWith("/meta"))
      return Response.json({
        data: {
          selection: {
            channels: ["public_demo"],
            plugins: ["test-plugin"],
            cloudTypes: ["115"],
          },
        },
      });
    assert.deepEqual(JSON.parse(init.body), {
      query: "test",
      mode: "merge",
      source: "all",
      channels: ["public_demo"],
      plugins: ["test-plugin"],
      cloudTypes: ["115"],
      refresh: false,
    });
    return Response.json({ data: { total: 0, items: [], linksByCloud: {} } });
  };
  assert.equal(
    (
      await api
        .service({ mode: "live", name: "test", token: "test-only" })
        .search("test")
    ).total,
    0,
  );
});
test("independent demo performs no network requests and resource URLs reject executable protocols", async () => {
  globalThis.fetch = () => {
    throw new Error("demo must be offline");
  };
  const demo = api.service({ mode: "demo", name: "test" });
  assert.ok(
    (await demo.discover({ mediaType: "tv" })).items.every(
      (m) => m.mediaType === "tv",
    ),
  );
  assert.ok((await demo.search("demo")).linksByCloud.magnet);
  assert.equal(api.safeURL("javascript:alert(1)"), undefined);
  assert.equal(api.safeURL("data:text/html,test"), undefined);
  assert.equal(
    api.safeURL("magnet:?xt=urn:btih:test"),
    "magnet:?xt=urn:btih:test",
  );
});

test("collecting plugin results bypasses frontend cache without refreshing the upstream search", async () => {
  const bodies = [];
  globalThis.fetch = async (url, init) => {
    if (String(url).endsWith("/meta"))
      return Response.json({
        data: {
          selection: { channels: [], plugins: ["test"], cloudTypes: [] },
        },
      });
    bodies.push(JSON.parse(init.body));
    return Response.json({
      data: { total: bodies.length, items: [], linksByCloud: {} },
    });
  };
  const live = api.service({ mode: "live", name: "test", token: "fixture" });
  assert.equal((await live.search("async-test")).total, 1);
  assert.equal((await live.search("async-test")).total, 1);
  assert.equal((await live.search("async-test", false, true)).total, 2);
  assert.equal(bodies.length, 2);
  assert.ok(
    bodies.every((body) => body.refresh === false && body.source === "plugin"),
  );
});

test("real backend discovery restrictions are respected when searching after filtering", () => {
  assert.deepEqual(
    api.discoveryQuery({
      source: "tmdb",
      mediaType: "movie",
      query: "Dune",
      pageSize: "24",
      genre: "878",
      region: "US",
      sort: "date.desc",
      year: "2024",
    }),
    {
      source: "tmdb",
      mediaType: "movie",
      query: "Dune",
      pageSize: "20",
      year: "2024",
    },
  );
  const bangumi = api.discoveryQuery({
    source: "bangumi",
    mediaType: "anime",
    query: "测试",
    year: "2024",
    month: "1",
    sort: "rank",
  });
  assert.equal(bangumi.year, undefined);
  assert.equal(bangumi.month, undefined);
  assert.equal(bangumi.sort, undefined);
});

test("merged PanSou results tolerate omitted items and empty cloud maps", () => {
  assert.deepEqual(api.normalizeResources({ total: 0 }), {
    total: 0,
    items: [],
    linksByCloud: {},
  });
  const r = api.normalizeResources({
    total: 1,
    linksByCloud: { magnet: [{ cloud: "magnet", url: "magnet:?xt=fixture" }] },
  });
  assert.deepEqual(r.items, []);
  assert.equal(r.linksByCloud.magnet.length, 1);
});
