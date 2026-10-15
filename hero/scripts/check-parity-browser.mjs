// Browser-only regression fixtures: intercept every API call; never create an account or remote task.
// Supply an existing Playwright test module via MEDIAHUB_PLAYWRIGHT_MODULE (no runtime dependency is added).
const { chromium, expect } = await import(
  process.env.MEDIAHUB_PLAYWRIGHT_MODULE || "@playwright/test"
);
const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox"],
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 1100 },
});
const p = await context.newPage();
const errors = [];
p.on("pageerror", (e) => errors.push(e.message));
const poster = "http://127.0.0.1:5174/fixture.svg";
const media = {
  mediaId: "tmdb:movie:1",
  provider: "tmdb",
  providerId: "1",
  source: "tmdb",
  sourceId: "1",
  mediaType: "movie",
  title: "验收作品",
  originalTitle: "Fixture",
  year: 2026,
  releaseDate: "2026-10-16",
  posterPath: poster,
  backdropPath: poster,
  genres: ["剧情"],
  originCountries: ["JP"],
  overview: "仅用于浏览器自动化的接口测试样本。",
  ratings: [{ source: "tmdb", value: 8.5 }],
  status: "已上映",
  credits: Array.from({ length: 12 }, (_, i) => ({
    name: `演员 ${i}`,
    role: "主演",
    profilePath: poster,
  })),
};
const draft = {
  title: "测试番剧",
  originalTitle: "Anime",
  bangumiId: "100",
  mikanId: "1",
  source: "mikan",
  url: "https://mikanani.me/RSS/Bangumi?bangumiId=1&subgroupid=2",
  subgroup: "测试字幕组",
  season: 1,
  offset: 0,
  totalEpisodes: 12,
  week: 1,
  releaseDate: "2026-10-01",
  poster,
  description: "测试订阅",
  rating: "8.1",
  enabled: true,
  match: [],
  exclude: [],
  standby: [],
};
const saved = {
  ...draft,
  id: "sub1",
  createdAt: "2026-10-16T00:00:00Z",
  updatedAt: "2026-10-16T00:00:00Z",
  latestEpisode: 1,
  knownEpisodes: [1],
  completed: false,
  lastCheckedAt: "",
  lastError: "",
  metadataError: "",
  resources: [],
};
const today = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());
let television = {
  id: "tv1",
  tmdbId: "10",
  title: "测试追剧",
  season: 1,
  source: "pansou",
  enabled: true,
  channels: [],
  match: "",
  exclude: "",
  episodes: [{ number: 1, name: "第一集", airDate: today }],
  resources: [],
  lastCheckedAt: "",
  nextCheckAt: "",
  lastError: "",
  metadataError: "",
  poster: "",
};
const tvWrites = [];
const logQueries = [];
const selection = {
  channels: ["fixture"],
  plugins: ["fixture"],
  cloudTypes: ["115", "magnet"],
  customChannels: [],
  detectionEnabled: false,
};
let searches = 0;
const downloads = [];
const creates = [];
let resolves = [];
let failTransfer = true;
await context.addInitScript(() =>
  sessionStorage.setItem(
    "mediahub.hero.session",
    JSON.stringify({
      mode: "live",
      name: "UI fixture",
      token: "fixture-test-only",
    }),
  ),
);
await context.route("**/fixture.svg", (r) =>
  r.fulfill({
    contentType: "image/svg+xml",
    body: '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900"><rect width="600" height="900" fill="#274467"/><circle cx="300" cy="350" r="170" fill="#8bc5be"/><text x="70" y="700" fill="white" font-size="55">TEST FIXTURE</text></svg>',
  }),
);
await context.route("**/api/**", async (route) => {
  const req = route.request(),
    u = new URL(req.url()),
    path = u.pathname,
    body = req.postDataJSON();
  let data = {};
  if (path === "/api/auth/me")
    data = { account: "fixture", name: "UI fixture" };
  else if (path === "/api/v1/subscriptions/tv") data = [television];
  else if (path === "/api/v1/subscriptions/tv/tv1") {
    tvWrites.push(body);
    television = { ...television, ...body };
    data = television;
  } else if (path === "/api/v1/downloads") {
    if (req.method() === "POST") {
      if (failTransfer) {
        failTransfer = false;
        await route.fulfill({
          status: 503,
          json: { message: "测试：115 尚未配置" },
        });
        return;
      }
      downloads.push(body);
      data = {
        task: {
          id: "task1",
          state: "queued",
          progress: 0,
          resourceId: "fixture",
          createdAt: new Date().toISOString(),
        },
        created: true,
      };
    } else data = { items: [] };
  } else if (path === "/api/media/providers")
    data = {
      providers: ["tmdb", "douban", "bangumi", "anilist"].map((source) => ({
        source,
        label: source,
        available: true,
        mediaTypes: source === "tmdb" ? ["movie", "tv"] : ["anime"],
        filters: {
          genre: [],
          region: [],
          sort: [],
          season: [],
          status: [],
          year: null,
          month: false,
        },
        supportsSearch: true,
        pageSizeMax: 20,
      })),
    };
  else if (path === "/api/media/discover")
    data = { items: [media], total: 1, page: 1, hasMore: false };
  else if (path.startsWith("/api/media/rankings/platforms"))
    data = { items: [{ id: 8, name: "Netflix", logo: poster }] };
  else if (path === "/api/media/rankings")
    data = {
      rankings: [
        { available: true, supported: true, result: { items: [media] } },
      ],
    };
  else if (path.startsWith("/api/media/"))
    data = {
      ...media,
      ...(path.includes("bangumi")
        ? {
            ...media,
            mediaId: "bangumi:anime:100",
            provider: "bangumi",
            source: "bangumi",
            sourceId: "100",
            providerId: "100",
            mediaType: "anime",
            title: "测试番剧",
          }
        : {}),
    };
  else if (path.endsWith("/sources/mikan/catalog"))
    data = {
      items: Array.from({ length: 23 }, (_, i) => ({
        id: String(i + 1),
        title: `测试番剧 ${i + 1}`,
        poster,
        week: "星期一",
      })),
      seasons: ["2026 秋"],
    };
  else if (path.endsWith("/groups"))
    data = [
      {
        label: "测试字幕组",
        url: draft.url,
        bangumiId: "100",
        items: [{ title: "测试番剧 1080p", publishedAt: "2026-10-16" }],
        groupRegex: {
          regexList: [[{ label: "1080p", regex: "(?i)1080p" }]],
          tags: [],
        },
      },
    ];
  else if (path.endsWith("/anime/resolve")) {
    resolves.push(body);
    if (resolves.length === 1) {
      await route.fulfill({
        status: 502,
        json: { message: "测试：RSS 解析失败" },
      });
      return;
    }
    data = { ...draft, match: body.match };
  } else if (path.endsWith("/anime/preview"))
    data = {
      accepted: 1,
      items: [
        {
          title: "测试番剧 01",
          episode: 1,
          accepted: true,
          reason: "匹配",
          fileName: "测试番剧 - S01E01.mkv",
        },
      ],
      warnings: [],
    };
  else if (path === "/api/v1/subscriptions/anime") {
    if (req.method() === "POST") {
      creates.push(body);
      data = saved;
    } else data = [saved];
  } else if (path === "/api/v1/resources/meta")
    data = {
      data: {
        selection,
        defaults: selection,
        channels: ["fixture"],
        plugins: [{ name: "fixture" }],
        cloudTypes: ["115", "magnet"],
      },
    };
  else if (path === "/api/v1/resources/search") {
    searches++;
    data = {
      data: {
        items: [{ title: "验收资源" }],
        total: 1,
        linksByCloud:
          searches <= 2
            ? { baidu: [] }
            : {
                115: [
                  {
                    cloud: "115",
                    url: "https://115.com/s/fixture1234",
                    password: "abcd",
                    note: "验收资源",
                  },
                ],
                baidu: [],
              },
      },
    };
  } else if (path === "/api/logs") {
    logQueries.push(u.searchParams.get("query"));
    data = { items: [] };
  } else if (path.startsWith("/api/settings/"))
    data = { values: {}, configuredSecrets: [], maskedSecrets: {} };
  else if (path === "/api/auth/api-keys") data = { items: [] };
  else if (path === "/api/emby/dashboard")
    data = {
      updatedAt: new Date().toISOString(),
      warnings: [],
      sites: [],
      stats: { all: {} },
      libraries: [],
      recentlyAdded: [],
      continueWatching: [],
    };
  else if (path.startsWith("/api/v1/organize/"))
    data = path.endsWith("/config")
      ? { id: "", sourceId: "", targetId: "", cron: "", enabled: false }
      : [];
  else {
    console.log("UNHANDLED", path);
    await route.fulfill({
      status: 404,
      json: { message: "test route missing" },
    });
    return;
  }
  await route.fulfill({ json: data });
});
try {
  await p.goto("http://127.0.0.1:5174/#/anime");
  await expect(
    p.getByRole("button", { name: "添加动漫", exact: true }),
  ).toBeVisible();
  await p.getByRole("button", { name: "添加动漫", exact: true }).click();
  await expect(p.getByRole("dialog")).toBeVisible();
  await expect(
    p.getByRole("textbox", { name: "标题", exact: true }),
  ).toHaveCount(0);
  await p.getByRole("button", { name: "浏览来源" }).click();
  await expect(
    p.getByRole("button", { name: "下一页", exact: true }),
  ).toBeVisible();
  await p.getByRole("button", { name: "下一页", exact: true }).click();
  await expect(
    p.getByRole("button", { name: "查看 测试番剧 21", exact: true }),
  ).toBeVisible();
  await p.getByRole("button", { name: "上一页", exact: true }).click();
  await p.getByRole("button", { name: "查看 测试番剧 1", exact: true }).click();
  await p.getByRole("button", { name: "添加", exact: true }).click();
  await expect(p.getByText("(?i)1080p", { exact: true })).toBeVisible();
  await p.getByRole("radio").nth(1).check();
  await p.getByRole("button", { name: "下一步", exact: true }).click();
  await expect(
    p.getByText("测试：RSS 解析失败", { exact: true }),
  ).toBeVisible();
  await p.getByRole("button", { name: "下一步", exact: true }).click();
  await expect(
    p.getByRole("textbox", { name: "标题", exact: true }),
  ).toHaveValue("测试番剧");
  console.log("resolved", resolves);
  const textarea = p.locator("textarea").nth(0);
  await textarea.fill("(?i)1080p\nHEVC");
  await expect(textarea).toHaveValue("(?i)1080p\nHEVC");
  await p.getByRole("button", { name: "预览匹配资源" }).click();
  await expect(p.getByText(/测试番剧 - S01E01.mkv/)).toBeVisible();
  await p.getByRole("button", { name: "保存订阅", exact: true }).click();
  await expect(p.getByRole("dialog")).toHaveCount(0);
  expect(creates[0].match).toEqual(["(?i)1080p", "HEVC"]);
  await p.getByRole("button", { name: "查看 测试番剧", exact: true }).click();
  await expect(p.getByRole("heading", { name: "作品资料" })).toBeVisible();
  await expect(p.getByRole("dialog")).toHaveCount(0);
  const rects = await p
    .locator(".detail-profile,.detail-credits")
    .evaluateAll((es) =>
      es.map((e) => ({
        x: e.getBoundingClientRect().x,
        y: e.getBoundingClientRect().y,
        w: e.getBoundingClientRect().width,
      })),
    );
  expect(rects[1].x).toBeGreaterThan(rects[0].x);
  await p.screenshot({ path: "/tmp/hero-detail-desktop.png" });
  await p.setViewportSize({ width: 390, height: 844 });
  const mobile = await p
    .locator(".detail-profile,.detail-credits")
    .evaluateAll((es) => es.map((e) => e.getBoundingClientRect().y));
  expect(mobile[1]).toBeGreaterThan(mobile[0]);
  await p.screenshot({ path: "/tmp/hero-detail-mobile.png" });
  await p.setViewportSize({ width: 1440, height: 1100 });
  await p.getByRole("button", { name: "搜索资源", exact: true }).click();
  await expect(
    p.getByRole("button", { name: "转存到 115", exact: true }),
  ).toBeVisible({ timeout: 12000 });
  await expect(p.getByRole("tab", { name: /百度/ })).toHaveCount(0);
  await p.getByRole("button", { name: "转存到 115", exact: true }).click();
  await expect(
    p.getByText("测试：115 尚未配置", { exact: true }),
  ).toBeVisible();
  await p.getByRole("button", { name: "转存到 115", exact: true }).click();
  await expect(p.getByRole("dialog")).toHaveCount(0);
  await expect(
    p.getByText("已加入下载队列，完成后按设置自动整理。"),
  ).toBeVisible();
  expect(downloads).toHaveLength(1);
  expect(downloads[0]).toMatchObject({
    wholeShare: true,
    receiveCode: "abcd",
    directoryId: "",
    kind: "share_transfer",
  });
  await p.reload();
  await expect(
    p.getByRole("button", { name: "转存到 115", exact: true }),
  ).toBeVisible();
  await p.getByRole("button", { name: "转存到 115", exact: true }).click();
  await expect(
    p.getByText("已加入下载队列，完成后按设置自动整理。"),
  ).toBeVisible();
  expect(downloads).toHaveLength(2);
  expect(downloads[1].reference.media).toMatchObject({
    type: "anime",
    provider: "bangumi",
    providerId: "100",
  });
  console.log(
    "PASS staged anime, pagination, rule AND, preview/create, shared detail, desktop/mobile columns, incremental tabs, one-click transfer",
  );
  for (const page of [
    "discover",
    "rankings",
    "calendar",
    "logs",
    "settings",
    "emby",
  ]) {
    await p.goto("http://127.0.0.1:5174/#/" + page);
    await p.waitForTimeout(600);
    console.log(
      "PAGE",
      page,
      (await p.locator("body").innerText()).slice(-150),
    );
  }
  await p.goto("http://127.0.0.1:5174/#/calendar");
  await p.getByRole("button", { name: "编辑规则", exact: true }).click();
  await p
    .getByRole("textbox", { name: "资源匹配正则", exact: true })
    .fill("(?i)(4k|2160p)");
  await p.getByRole("button", { name: "保存订阅", exact: true }).click();
  await expect(p.getByRole("dialog")).toHaveCount(0);
  expect(tvWrites.at(-1).match).toBe("(?i)(4k|2160p)");
  await p.goto("http://127.0.0.1:5174/#/logs");
  await p
    .getByRole("textbox", { name: "关键词", exact: true })
    .fill("browser-query");
  await expect.poll(() => logQueries.includes("browser-query")).toBe(true);
  await p.goto("http://127.0.0.1:5174/#/settings");
  for (const tab of [
    "搜索规则",
    "资源搜索",
    "账号与安全",
    "API 密钥",
    "通知与机器人",
    "媒体整理",
    "基础配置",
  ]) {
    await p.getByRole("tab", { name: tab, exact: true }).click();
    await p.waitForTimeout(150);
  }
  await p.getByRole("tab", { name: "媒体整理", exact: true }).click();
  await p.locator("summary").filter({ hasText: "下载记录与异常处理" }).click();
  await expect(p.getByRole("heading", { name: /下载任务/ })).toBeVisible();
  console.log(
    "PASS TV Go-regex save, reactive log query, all settings tabs, download records",
  );
  // Open the authoritative frontend with the same intercepted metadata, never its real account.
  const reference = await context.newPage();
  reference.on("pageerror", (e) => errors.push(e.message));
  await reference.addInitScript(() =>
    sessionStorage.setItem("frame.mockAccessToken", "fixture-test-only"),
  );
  await reference.goto("http://127.0.0.1:5173/discover/explore");
  await reference
    .getByRole("button", { name: "查看《验收作品》详情", exact: true })
    .click();
  await expect(reference.getByText("作品资料", { exact: true })).toBeVisible();
  await expect(
    reference.getByText("主要演职员", { exact: true }),
  ).toBeVisible();
  const profile = reference
    .getByText("作品资料", { exact: true })
    .locator("xpath=ancestor::*[@data-slot='card'][1]");
  const cast = reference
    .getByText("主要演职员", { exact: true })
    .locator("xpath=ancestor::*[@data-slot='card'][1]");
  const left = await profile.boundingBox(),
    right = await cast.boundingBox();
  expect(right.x).toBeGreaterThan(left.x);
  expect(left.width).toBeLessThanOrEqual(341);
  await reference.screenshot({ path: "/tmp/web-detail-reference.png" });
  await reference.close();
  console.log(
    "PASS web baseline uses the same profile/cast order and desktop column constraint",
  );
  expect(errors).toEqual([]);
  console.log("PASS no runtime page errors");
} catch (e) {
  await p.screenshot({ path: "/tmp/hero-browser-failure.png" });
  console.log((await p.locator("body").innerText()).slice(-4000));
  throw e;
} finally {
  await browser.close();
}
