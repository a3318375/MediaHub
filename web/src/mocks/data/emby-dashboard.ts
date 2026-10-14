export type EmbySiteId = "main" | "animation"

export type EmbyMediaItem = {
  id: string
  title: string
  artworkTitle: string
  kind: "电影" | "剧集" | "动画" | "纪录片"
  year: number
  rating: string
  libraryId: string
  siteId: EmbySiteId
  summary: string
  palette: string
}

export type EmbyResumeItem = EmbyMediaItem & {
  progress: number
  resumeLabel: string
  remaining: string
}

export const embySites = [
  { id: "all", label: "全部站点" },
  { id: "main", label: "主媒体库" },
  { id: "animation", label: "动画媒体库" },
] as const

export const embyStats = {
  all: { movies: 4277, series: 86, episodes: 1832, plays: 1246, viewers: 3, hours: 684 },
  main: { movies: 3168, series: 54, episodes: 1074, plays: 902, viewers: 2, hours: 492 },
  animation: { movies: 1109, series: 32, episodes: 758, plays: 344, viewers: 1, hours: 192 },
}

export const embyLibraries = [
  { id: "chinese", title: "华语电影", type: "电影", count: 1248, siteId: "main" },
  { id: "western", title: "欧美剧集", type: "剧集", count: 426, siteId: "main" },
  { id: "documentary", title: "纪录片", type: "纪录片", count: 318, siteId: "main" },
  { id: "anime", title: "日系动画", type: "动画", count: 692, siteId: "animation" },
  { id: "donghua", title: "国漫", type: "动画", count: 417, siteId: "animation" },
  { id: "concert", title: "音乐现场", type: "演出", count: 184, siteId: "main" },
] as const

export const recentlyAdded: EmbyMediaItem[] = [
  { id: "recent-1", title: "夏日信号", artworkTitle: "夏日\n信号", kind: "电影", year: 2025, rating: "8.2", libraryId: "chinese", siteId: "main", summary: "一封迟到的来信，让海边小镇重新热闹起来。", palette: "from-chart-1 via-chart-4 to-chart-5" },
  { id: "recent-2", title: "雾城档案", artworkTitle: "雾城\n档案", kind: "剧集", year: 2026, rating: "8.6", libraryId: "western", siteId: "main", summary: "旧城重启调查，一份尘封档案牵出新的线索。", palette: "from-chart-2 via-chart-3 to-chart-1" },
  { id: "recent-3", title: "深海来信", artworkTitle: "深海\n来信", kind: "纪录片", year: 2025, rating: "9.1", libraryId: "documentary", siteId: "main", summary: "跟随科研团队，记录深海生态的四季变化。", palette: "from-chart-2 via-chart-1 to-chart-3" },
  { id: "recent-4", title: "星际远航", artworkTitle: "星际\n远航", kind: "动画", year: 2026, rating: "8.9", libraryId: "anime", siteId: "animation", summary: "一支年轻的船员队伍，踏上寻找新家园的旅程。", palette: "from-chart-4 via-chart-5 to-chart-2" },
  { id: "recent-5", title: "山海之间", artworkTitle: "山海\n之间", kind: "动画", year: 2025, rating: "8.4", libraryId: "donghua", siteId: "animation", summary: "少年与伙伴穿行群山，寻找传说中的归途。", palette: "from-chart-3 via-chart-2 to-chart-5" },
  { id: "recent-6", title: "城市回声", artworkTitle: "城市\n回声", kind: "电影", year: 2024, rating: "7.9", libraryId: "chinese", siteId: "main", summary: "几段交错的人生，在同一座城市里彼此照亮。", palette: "from-chart-5 via-chart-1 to-chart-4" },
  { id: "recent-7", title: "光影现场", artworkTitle: "光影\n现场", kind: "纪录片", year: 2026, rating: "8.7", libraryId: "concert", siteId: "main", summary: "镜头记录一场巡演从排练到谢幕的完整过程。", palette: "from-chart-1 via-chart-5 to-chart-3" },
  { id: "recent-8", title: "云端邮差", artworkTitle: "云端\n邮差", kind: "动画", year: 2026, rating: "8.5", libraryId: "anime", siteId: "animation", summary: "云海之上的邮路，连接着一座座漂浮的岛屿。", palette: "from-chart-4 via-chart-2 to-chart-1" },
]

export const continueWatching: EmbyResumeItem[] = [
  { ...recentlyAdded[1], id: "resume-1", title: "雾城档案 · 第 4 集", progress: 68, resumeLabel: "第 4 集 · 暗房", remaining: "还剩 18 分钟" },
  { ...recentlyAdded[3], id: "resume-2", title: "星际远航 · 第 8 集", progress: 42, resumeLabel: "第 8 集 · 近地点", remaining: "还剩 26 分钟" },
  { ...recentlyAdded[0], id: "resume-3", progress: 81, resumeLabel: "电影 · 01:34:12", remaining: "还剩 22 分钟" },
  { ...recentlyAdded[4], id: "resume-4", title: "山海之间 · 第 2 集", progress: 29, resumeLabel: "第 2 集 · 入山", remaining: "还剩 16 分钟" },
  { ...recentlyAdded[2], id: "resume-5", progress: 54, resumeLabel: "纪录片 · 第二章", remaining: "还剩 31 分钟" },
  { ...recentlyAdded[7], id: "resume-6", title: "云端邮差 · 第 1 集", progress: 18, resumeLabel: "第 1 集 · 起航", remaining: "还剩 20 分钟" },
]
