import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

async function load(path) {
  const source = await readFile(new URL(path, import.meta.url), "utf8");
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext },
  }).outputText;
  return import(
    `data:text/javascript;base64,${Buffer.from(js).toString("base64")}`
  );
}
const { navigationItems, settingsTabs, resolvePage } = await load(
  "../src/lib/parity.ts",
);

test("HeroUI navigation follows the current shadcn menu, including removed entries", async () => {
  const original = await readFile(
    new URL(
      "../../web/src/layouts/media-shell/navigation-data.ts",
      import.meta.url,
    ),
    "utf8",
  );
  const labels = [...original.matchAll(/\{ title: "([^"]+)", path:/g)].map(
    (match) => match[1],
  );
  assert.deepEqual(
    navigationItems.map(([, label]) => label),
    labels,
  );
  assert.equal(resolvePage("downloads"), "settings");
  assert.equal(resolvePage("organize"), "settings");
  assert.equal(resolvePage("tools/downloads"), "settings");
  assert.equal(resolvePage("tools/organize"), "settings");
  assert.equal(resolvePage("discover/explore"), "discover");
  assert.equal(resolvePage("discover/calendar"), "calendar");
  assert.equal(resolvePage("subscriptions"), "calendar");
  assert.equal(resolvePage(""), "emby");
});

test("settings categories and order follow the customized shadcn settings", async () => {
  const original = await readFile(
    new URL("../../web/src/components/settings-page.tsx", import.meta.url),
    "utf8",
  );
  const tabs = original.slice(
    original.indexOf("const tabs:"),
    original.indexOf("const defaults:"),
  );
  const categories = [
    ...tabs.matchAll(/\{ value: "([^"]+)", label: "([^"]+)" \}/g),
  ].map((match) => [match[1], match[2]]);
  assert.deepEqual(settingsTabs, categories);
});

test("resource history stays compatible with original media searches and preserves both kinds", async () => {
  const {
    readResourceSearchHistory,
    readMediaSearchHistory,
    saveResourceSearchHistory,
    RESOURCE_SEARCH_HISTORY_KEY,
  } = await load("../src/lib/resource-search.ts");
  const entries = [
    { kind: "media", keyword: "沙丘", source: "tmdb", at: 1 },
    {
      keyword: "旧资源",
      source: "tg",
      mode: "all",
      cloudTypes: ["115"],
      plugins: [],
      channels: ["test"],
      at: 2,
    },
  ];
  const values = new Map([
    [RESOURCE_SEARCH_HISTORY_KEY, JSON.stringify(entries)],
  ]);
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  assert.equal(readResourceSearchHistory(storage)[0].keyword, "旧资源");
  saveResourceSearchHistory(storage, {
    keyword: "沙丘",
    source: "all",
    mode: "default",
    cloudTypes: [],
    plugins: [],
    channels: [],
    at: 3,
  });
  assert.equal(readResourceSearchHistory(storage).length, 2);
  assert.equal(readMediaSearchHistory(storage)[0].keyword, "沙丘");
  saveResourceSearchHistory(storage, {
    keyword: "沙丘",
    source: "tg",
    mode: "default",
    cloudTypes: [],
    plugins: [],
    channels: [],
    at: 4,
  });
  assert.equal(readResourceSearchHistory(storage).length, 2);
  assert.equal(readResourceSearchHistory(storage)[0].source, "tg");
});
