export type RankingCategory = "imdb-movies" | "imdb-series" | "tmdb-trending" | "anilist-popular" | "bangumi-today"
export type RankingEntry = {
  id: string
  title: string
  year: number
  kind: string
  rating: number
  region: string
  source: string
  platforms: string[]
  palette: string
  tagline: string
}

export const rankingCategories: { id: RankingCategory; source: string; title: string; description: string }[] = [
  { id: "imdb-movies", source: "IMDb 热门电影", title: "IMDb 最热门电影", description: "近期关注度较高的电影" },
  { id: "imdb-series", source: "IMDb 最热门剧集", title: "IMDb 最热门剧集", description: "近期关注度较高的剧集" },
  { id: "tmdb-trending", source: "TMDB 趋势", title: "TMDB 趋势", description: "近期讨论度上升的影视内容" },
  { id: "anilist-popular", source: "AniList 热门", title: "AniList 热门", description: "动画社区人气作品" },
  { id: "bangumi-today", source: "Bangumi 今日动画", title: "Bangumi 今日动画", description: "动画条目今日人气排行" },
]

const paletteOptions = [
  "from-amber-700 via-orange-900 to-stone-950",
  "from-sky-700 via-blue-950 to-slate-950",
  "from-emerald-700 via-teal-950 to-slate-950",
  "from-violet-700 via-indigo-950 to-slate-950",
  "from-rose-700 via-red-950 to-stone-950",
  "from-cyan-700 via-slate-900 to-indigo-950",
  "from-fuchsia-700 via-purple-950 to-slate-950",
  "from-lime-700 via-green-950 to-stone-950",
  "from-slate-600 via-slate-900 to-black",
  "from-orange-700 via-amber-950 to-stone-950",
]
const platformOptions = ["Netflix", "HBO", "Apple TV+", "Disney+", "Crunchyroll", "Prime Video", "Amazon", "Hulu", "猫眼", "豆瓣", "腾讯视频"]
const regionOptions = ["全球", "北美", "亚洲", "中国大陆"]
const titleSets: Record<RankingCategory, string[]> = {
  "imdb-movies": ["雾中来客", "深蓝回声", "旧城新日", "星际旅人", "漫长告别", "无声证词", "冬日来信", "山海之间", "最后的灯塔", "向北而行"],
  "imdb-series": ["边界档案", "第七码头", "远方信号", "晨光之后", "白夜列车", "拾荒者", "空中花园", "暗河来信", "昨日地图", "微光小镇"],
  "tmdb-trending": ["月球背面", "午夜食堂", "纸上迷宫", "夏日留声机", "深海计划", "城市漫游", "无人之境", "雨季将尽", "昨日重现", "新世界日记"],
  "anilist-popular": ["星屑航线", "雨天的图书馆", "纸月邮差", "海风合唱团", "浮岛日记", "第九颗星", "午后列车", "蓝色信笺", "云端邮局", "夏日终站"],
  "bangumi-today": ["春日物语", "远山信号", "月光食堂", "云上邮局", "四季电台", "风之车站", "草原来信", "明日晴空", "群星之间", "慢慢长夜"],
}
const regionByIndex = ["北美", "亚洲", "中国大陆", "全球", "亚洲", "北美", "中国大陆", "全球", "亚洲", "北美"]

export const rankingLists: Record<RankingCategory, RankingEntry[]> = Object.fromEntries(
  rankingCategories.map(({ id, source }, categoryIndex) => [
    id,
    titleSets[id].map((title, index) => ({
      id: id + "-" + (index + 1),
      title,
      year: 2026 - ((index + categoryIndex) % 8),
      kind: id.includes("series") || id.includes("anilist") || id.includes("bangumi") ? "剧集" : "电影",
      rating: Number((9.2 - ((index * 7 + categoryIndex * 3) % 35) / 10).toFixed(1)),
      region: regionByIndex[(index + categoryIndex) % regionByIndex.length],
      source,
      platforms: [platformOptions[(index + categoryIndex) % platformOptions.length], platformOptions[(index + categoryIndex + 4) % platformOptions.length]],
      palette: paletteOptions[(index + categoryIndex) % paletteOptions.length],
      tagline: "一段关于选择、旅程与重新出发的故事。",
    })),
  ])
) as Record<RankingCategory, RankingEntry[]>

export { platformOptions, regionOptions }
