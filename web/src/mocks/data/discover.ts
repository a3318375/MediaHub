import type { MediaSource, MediaSummary } from "@/lib/media-contract"

export type DiscoverSource = Exclude<MediaSource, "emby"> | "people"
export type DiscoverMediaType = "all" | "movie" | "tv"

export type DiscoverItem = Pick<MediaSummary, "title" | "genres"> & {
  id: string
  title: string
  originalTitle: string
  kind: "电影" | "剧集" | "动画"
  year: number
  region: string
  genres: string[]
  rating: number
  source: Exclude<DiscoverSource, "people">
  summary: string
  palette: string
  artwork: string
}

export const discoverSources: { id: DiscoverSource; label: string; note: string }[] = [
  { id: "tmdb", label: "TMDB 片库", note: "电影与剧集" },
  { id: "douban", label: "豆瓣", note: "分类浏览" },
  { id: "anilist", label: "AniList 动漫", note: "日本动画" },
  { id: "bangumi", label: "Bangumi 动漫", note: "动画条目" },
  { id: "people", label: "热门演员", note: "人物与作品" },
]

export const discoverItems: DiscoverItem[] = [
  { id: "tm-01", title: "雾港来信", originalTitle: "Letters from the Fog Harbor", kind: "电影", year: 2026, region: "欧美", genres: ["悬疑", "剧情"], rating: 8.4, source: "tmdb", summary: "一位修复师在旧港口收到多年未寄出的信件，循着地址揭开小镇沉默的往事。", palette: "from-slate-700 via-sky-900 to-cyan-950", artwork: "雾港\n来信" },
  { id: "tm-02", title: "最后一班列车", originalTitle: "The Last Train", kind: "电影", year: 2025, region: "日本", genres: ["剧情", "爱情"], rating: 7.9, source: "tmdb", summary: "每到冬天，两位陌生人都会搭上同一班夜车，交换一段只属于旅途的故事。", palette: "from-amber-800 via-rose-900 to-slate-950", artwork: "最后一班\n列车" },
  { id: "tm-03", title: "静默协议", originalTitle: "Silent Protocol", kind: "剧集", year: 2026, region: "欧美", genres: ["科幻", "惊悚"], rating: 8.8, source: "tmdb", summary: "轨道空间站发生系统故障，地面团队发现所有记录都指向一个不存在的乘员。", palette: "from-indigo-800 via-violet-950 to-slate-950", artwork: "静默\n协议" },
  { id: "tm-04", title: "山海小馆", originalTitle: "The Little Mountain Inn", kind: "电影", year: 2024, region: "大陆", genres: ["喜剧", "家庭"], rating: 8.1, source: "tmdb", summary: "回乡接手老客栈的姐弟，用一道道家常菜重新认识这座山城和彼此。", palette: "from-emerald-800 via-teal-900 to-lime-950", artwork: "山海\n小馆" },
  { id: "db-01", title: "春日留声机", originalTitle: "Spring Gramophone", kind: "电影", year: 2025, region: "大陆", genres: ["剧情", "音乐"], rating: 8.7, source: "douban", summary: "旧唱片店即将关门，店主决定在最后一个春天找回失散多年的乐队成员。", palette: "from-orange-700 via-rose-800 to-red-950", artwork: "春日\n留声机" },
  { id: "db-02", title: "河岸照相馆", originalTitle: "Riverside Photo Studio", kind: "电影", year: 2023, region: "台湾", genres: ["剧情", "家庭"], rating: 8.3, source: "douban", summary: "一家开在河边的老照相馆，保存着几代人的生活片段。", palette: "from-cyan-800 via-blue-900 to-slate-950", artwork: "河岸\n照相馆" },
  { id: "db-03", title: "不眠街道", originalTitle: "Sleepless Avenue", kind: "剧集", year: 2026, region: "香港", genres: ["悬疑", "犯罪"], rating: 8.5, source: "douban", summary: "深夜便利店的监控拍到一位已失踪十年的顾客，值班员开始追查他的来历。", palette: "from-blue-800 via-slate-900 to-indigo-950", artwork: "不眠\n街道" },
  { id: "db-04", title: "风吹过稻田", originalTitle: "Wind over the Fields", kind: "电影", year: 2022, region: "大陆", genres: ["纪录片", "家庭"], rating: 9.0, source: "douban", summary: "一户人家在四季更替中守护稻田，也记录着乡村生活的细微变化。", palette: "from-lime-800 via-green-900 to-emerald-950", artwork: "风吹过\n稻田" },
  { id: "an-01", title: "星屑航线", originalTitle: "Stardust Route", kind: "动画", year: 2026, region: "日本", genres: ["冒险", "科幻"], rating: 8.9, source: "anilist", summary: "见习领航员和一只会说话的机械鸟，开始寻找传说中的第九颗星。", palette: "from-violet-700 via-indigo-900 to-blue-950", artwork: "星屑\n航线" },
  { id: "an-02", title: "雨天的图书馆", originalTitle: "Library on a Rainy Day", kind: "动画", year: 2025, region: "日本", genres: ["日常", "剧情"], rating: 8.2, source: "anilist", summary: "每逢下雨才会出现的图书馆，收藏着来访者还没有写下的回忆。", palette: "from-sky-700 via-cyan-900 to-slate-950", artwork: "雨天的\n图书馆" },
  { id: "an-03", title: "纸月邮差", originalTitle: "Paper Moon Courier", kind: "动画", year: 2024, region: "日本", genres: ["奇幻", "冒险"], rating: 8.6, source: "anilist", summary: "纸月升起的夜晚，年轻邮差要把一封信送到地图上没有标注的岛屿。", palette: "from-fuchsia-800 via-purple-950 to-indigo-950", artwork: "纸月\n邮差" },
  { id: "an-04", title: "海风合唱团", originalTitle: "Sea Breeze Choir", kind: "动画", year: 2023, region: "韩国", genres: ["音乐", "爱情"], rating: 7.8, source: "anilist", summary: "海边小镇的学生们为了守住社团教室，决定重新组建合唱团。", palette: "from-rose-700 via-pink-900 to-slate-950", artwork: "海风\n合唱团" },
  { id: "bg-01", title: "夏日终站", originalTitle: "Last Stop in Summer", kind: "动画", year: 2008, region: "日本", genres: ["剧情", "爱情"], rating: 8.7, source: "bangumi", summary: "毕业前的最后一个暑假，几位朋友约定在小镇终点站再次相见。", palette: "from-sky-700 via-blue-900 to-indigo-950", artwork: "夏日\n终站" },
  { id: "bg-02", title: "远山信号", originalTitle: "Signals from the Hills", kind: "动画", year: 2021, region: "日本", genres: ["科幻", "悬疑"], rating: 8.4, source: "bangumi", summary: "山间气象台收到来自未来的短波信号，值守员试图确认发送者身份。", palette: "from-emerald-800 via-teal-950 to-slate-950", artwork: "远山\n信号" },
  { id: "bg-03", title: "月光食堂", originalTitle: "Moonlight Diner", kind: "动画", year: 2017, region: "日本", genres: ["美食", "日常"], rating: 8.1, source: "bangumi", summary: "只在月圆夜营业的小食堂，用一道料理帮助客人整理心事。", palette: "from-amber-700 via-orange-900 to-stone-950", artwork: "月光\n食堂" },
  { id: "bg-04", title: "云上邮局", originalTitle: "Post Office in the Clouds", kind: "动画", year: 2019, region: "日本", genres: ["奇幻", "冒险"], rating: 8.5, source: "bangumi", summary: "云层之上的邮局负责投递梦境，实习生第一次收到一封寄给自己的信。", palette: "from-indigo-700 via-sky-900 to-cyan-950", artwork: "云上\n邮局" },
]

export const discoverPeople = [
  { id: "person-1", name: "林知夏", originalName: "Lin Zhixia", role: "演员 · 导演", knownFor: "《春日留声机》《河岸照相馆》", popularity: 92, palette: "from-rose-400 via-orange-300 to-amber-200", initials: "林" },
  { id: "person-2", name: "周予安", originalName: "Zhou Yuan", role: "演员", knownFor: "《静默协议》《雾港来信》", popularity: 87, palette: "from-sky-500 via-cyan-300 to-teal-200", initials: "周" },
  { id: "person-3", name: "陈以南", originalName: "Chen Yinan", role: "演员 · 配音", knownFor: "《星屑航线》《纸月邮差》", popularity: 81, palette: "from-violet-400 via-fuchsia-300 to-pink-200", initials: "陈" },
  { id: "person-4", name: "顾明川", originalName: "Gu Mingchuan", role: "演员", knownFor: "《山海小馆》《不眠街道》", popularity: 76, palette: "from-emerald-500 via-lime-300 to-yellow-200", initials: "顾" },
  { id: "person-5", name: "沈星遥", originalName: "Shen Xingyao", role: "演员 · 歌手", knownFor: "《海风合唱团》《夏日终站》", popularity: 72, palette: "from-indigo-400 via-blue-300 to-sky-200", initials: "沈" },
  { id: "person-6", name: "许闻溪", originalName: "Xu Wenxi", role: "演员", knownFor: "《雨天的图书馆》《月光食堂》", popularity: 68, palette: "from-amber-400 via-rose-300 to-orange-200", initials: "许" },
]
