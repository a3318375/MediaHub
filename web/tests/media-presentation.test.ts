import assert from "node:assert/strict"
import test from "node:test"
import {
  presentMediaError,
  formatRegion,
  formatResultTotal,
  mediaImageUrl,
  presentTitle,
} from "../src/lib/media-presentation.ts"

test("地区中文映射、多国、空值及未知代码回退", () => {
  assert.equal(
    formatRegion(["CN", "HK", "TW", "JP", "KR", "US", "GB"]),
    "大陆、香港、台湾、日本、韩国、美国、英国"
  )
  assert.equal(formatRegion(["US", "ZZ"]), "美国、ZZ")
  assert.equal(formatRegion([], "US,GB"), "美国、英国")
  assert.equal(formatRegion(undefined, "大陆"), "大陆")
  assert.equal(formatRegion([]), "")
  assert.equal(formatRegion(), "")
})

test("总数由返回的 capped 标记决定，不猜测精确总量", () => {
  assert.equal(formatResultTotal(null), " · 数量由上游决定")
  assert.equal(formatResultTotal(null, true), " · 数量由上游决定")
  assert.equal(formatResultTotal(0), " · 共 0 部作品")
  assert.equal(formatResultTotal(20001), " · 共 20001 部作品")
  for (const total of [500, 5000, 20001])
    assert.equal(
      formatResultTotal(total, true),
      ` · 共 ${total}+ 部作品（上游上限）`
    )
})

test("AniList 中文别名优先，其次中文原名和数据集标题", () => {
  const base = {
    provider: "anilist",
    title: "数据集中文",
    titles: {
      native: "中文原名",
      romaji: "Romaji",
      english: "English",
      synonyms: ["English alias", "中文别名"],
    },
  }
  assert.deepEqual(presentTitle(base), {
    title: "中文别名",
    subtitle: "Romaji",
  })
  assert.equal(
    presentTitle({ ...base, titles: { ...base.titles, synonyms: [] } }).title,
    "中文原名"
  )
  assert.equal(
    presentTitle({
      ...base,
      titles: { native: "進撃の巨人", romaji: "Shingeki" },
    }).title,
    "数据集中文"
  )
  assert.equal(
    presentTitle({
      provider: "tmdb",
      title: "中文片名",
      originalTitle: "Original",
    }).title,
    "中文片名"
  )
})

test("缺中文时依次回退 romaji、english、native、title", () => {
  const base = { provider: "anilist", title: "Fallback" }
  assert.equal(
    presentTitle({
      ...base,
      titles: { romaji: "Romaji", english: "English", native: "かな" },
    }).title,
    "Romaji"
  )
  assert.deepEqual(presentTitle({ ...base, titles: { romaji: "Romaji" } }), {
    title: "Romaji",
    subtitle: undefined,
  })
  assert.equal(
    presentTitle({ ...base, titles: { english: "English", native: "かな" } })
      .title,
    "English"
  )
  assert.equal(
    presentTitle({ ...base, titles: { native: "かな" } }).title,
    "かな"
  )
  assert.equal(presentTitle(base).title, "Fallback")
  assert.equal(
    presentTitle({ title: "Same", originalTitle: "Same" }).subtitle,
    undefined
  )
})

test("图片绝对地址、豆瓣 CDN 代理、TMDB 路径和空值", () => {
  for (const url of [
    "https://example.com/image.jpg",
    "http://example.com/image.jpg",
  ])
    assert.equal(mediaImageUrl(url), url)
  for (const host of ["img1", "img2", "img3", "img9"]) {
    const url = `https://${host}.doubanio.com/view/photo.jpg?size=large`
    assert.equal(
      mediaImageUrl(url),
      `/api/media/image?source=douban&url=${encodeURIComponent(url)}`
    )
  }
  assert.equal(
    mediaImageUrl("https://img1.doubanio.com.evil.test/a"),
    "https://img1.doubanio.com.evil.test/a"
  )
  assert.equal(
    mediaImageUrl("/poster.jpg"),
    "https://image.tmdb.org/t/p/w342/poster.jpg"
  )
  // 后端返回的本站代理路径必须原样使用（豆瓣海报），不能再拼图片 CDN 前缀。
  const proxied =
    "/api/media/image?source=douban&url=" +
    encodeURIComponent("https://img2.doubanio.com/view/photo/x.webp")
  assert.equal(mediaImageUrl(proxied), proxied)
  assert.equal(mediaImageUrl(proxied, "w780"), proxied)
  assert.equal(
    mediaImageUrl("/api/media/image?source=douban&url=a"),
    "/api/media/image?source=douban&url=a"
  )
  assert.equal(
    mediaImageUrl("/backdrop.jpg", "w780"),
    "https://image.tmdb.org/t/p/w780/backdrop.jpg"
  )
  for (const value of [undefined, null, "", " "])
    assert.equal(mediaImageUrl(value), undefined)
})


test("错误语义不重复，保留类别和不同详情", () => {
  assert.equal(presentMediaError(504, "上游请求超时"), "上游请求超时，请重试")
  assert.equal(presentMediaError(504, "上游请求超时，请稍后重试"), "上游请求超时，请稍后重试")
  assert.equal(presentMediaError(502, "上游服务异常"), "上游服务异常")
  assert.equal(presentMediaError(401, "会话已失效，请重新登录"), "会话已失效，请重新登录")
  assert.equal(presentMediaError(503, "豆瓣触发风控", "600"), "数据源暂不可用：豆瓣触发风控（Retry-After：600）")
  assert.match(presentMediaError(429, "稍后再试"), /本服务请求过于频繁/)
  assert.match(presentMediaError(404, "未找到媒体条目"), /未找到媒体/)
})
