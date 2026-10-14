import type { AnimeSubscription } from "@/lib/anime-api"
export type { AnimeSubscription, AnimeSubscriptionStatus } from "@/lib/anime-api"

export const animeSubscriptions: AnimeSubscription[] = [
  {
    id: "anime-01", title: "纸月邮差", originalTitle: "Paper Moon Courier", status: "更新中", currentEpisode: 8, totalEpisodes: 12, nextUpdate: "周一 23:30", nextEpisode: "第 9 集", rating: "8.6", genres: ["奇幻", "冒险"],
    description: "年轻邮差穿梭于漂浮群岛之间，递送那些无法通过普通方式抵达的信件。每一封信都让他更接近纸月升起的秘密。",
    palette: "from-fuchsia-700 via-purple-950 to-indigo-950", artwork: "纸月\n邮差",
    recentEpisodes: [{ episode: "第 8 集", title: "云海的另一边", updatedAt: "今天 08:15" }, { episode: "第 7 集", title: "无人认领的信", updatedAt: "10月3日" }, { episode: "第 6 集", title: "风向标", updatedAt: "9月26日" }],
  },
  {
    id: "anime-02", title: "雨天的图书馆", originalTitle: "Library on a Rainy Day", status: "更新中", currentEpisode: 5, totalEpisodes: 11, nextUpdate: "周二 00:00", nextEpisode: "第 6 集", rating: "8.2", genres: ["日常", "剧情"],
    description: "每逢下雨才会出现的图书馆，收藏着来访者还没有写下的回忆。新来的管理员渐渐发现，自己也有一本未完成的书。",
    palette: "from-sky-700 via-cyan-900 to-slate-950", artwork: "雨天的\n图书馆",
    recentEpisodes: [{ episode: "第 5 集", title: "借阅期限", updatedAt: "昨天 22:10" }, { episode: "第 4 集", title: "窗边座位", updatedAt: "10月2日" }, { episode: "第 3 集", title: "雨声目录", updatedAt: "9月25日" }],
  },
  {
    id: "anime-03", title: "星屑航线", originalTitle: "Stardust Route", status: "更新中", currentEpisode: 8, totalEpisodes: 24, nextUpdate: "周三 21:00", nextEpisode: "第 9 集", rating: "8.9", genres: ["科幻", "冒险"],
    description: "见习领航员和一只会说话的机械鸟，开始寻找传说中的第九颗星。一路上，他们遇见了许多选择不同航线的人。",
    palette: "from-violet-700 via-indigo-950 to-blue-950", artwork: "星屑\n航线",
    recentEpisodes: [{ episode: "第 8 集", title: "引力边界", updatedAt: "10月7日 21:12" }, { episode: "第 7 集", title: "旧坐标", updatedAt: "9月30日" }, { episode: "第 6 集", title: "第一颗星", updatedAt: "9月23日" }],
  },
  {
    id: "anime-04", title: "海风合唱团", originalTitle: "Sea Breeze Choir", status: "已暂停", currentEpisode: 4, totalEpisodes: 12, nextUpdate: "已暂停", nextEpisode: "等待恢复", rating: "7.8", genres: ["音乐", "校园"],
    description: "海边小镇的学生们为了守住社团教室，决定重新组建合唱团。练习和比赛之外，他们也在寻找各自的声音。",
    palette: "from-rose-700 via-pink-950 to-slate-950", artwork: "海风\n合唱团",
    recentEpisodes: [{ episode: "第 4 集", title: "合声练习", updatedAt: "9月28日" }, { episode: "第 3 集", title: "空教室", updatedAt: "9月21日" }, { episode: "第 2 集", title: "招新日", updatedAt: "9月14日" }],
  },
  {
    id: "anime-05", title: "云上邮局", originalTitle: "Post Office in the Clouds", status: "更新中", currentEpisode: 3, totalEpisodes: 10, nextUpdate: "周四 22:30", nextEpisode: "第 4 集", rating: "8.4", genres: ["治愈", "奇幻"],
    description: "云层之上的邮局负责投递梦境。实习生第一次收到一封寄给自己的信，信上的地址却是他从未去过的地方。",
    palette: "from-indigo-700 via-sky-900 to-cyan-950", artwork: "云上\n邮局",
    recentEpisodes: [{ episode: "第 3 集", title: "寄给未来", updatedAt: "10月8日 22:45" }, { episode: "第 2 集", title: "雾中航道", updatedAt: "10月1日" }, { episode: "第 1 集", title: "第一封信", updatedAt: "9月24日" }],
  },
  {
    id: "anime-06", title: "午后列车", originalTitle: "The Afternoon Train", status: "已完结", currentEpisode: 12, totalEpisodes: 12, nextUpdate: "已完结", nextEpisode: "全 12 集",
    rating: "8.1", genres: ["青春", "剧情"], description: "毕业前的最后一个夏天，几位朋友乘上同一班列车，去完成各自一直没有说出口的心愿。",
    palette: "from-amber-700 via-orange-900 to-stone-950", artwork: "午后\n列车",
    recentEpisodes: [{ episode: "第 12 集", title: "终点站", updatedAt: "9月30日" }, { episode: "第 11 集", title: "沿线风景", updatedAt: "9月23日" }, { episode: "第 10 集", title: "换乘", updatedAt: "9月16日" }],
  },
  {
    id: "anime-07", title: "风之车站", originalTitle: "Station of the Wind", status: "更新中", currentEpisode: 6, totalEpisodes: 13, nextUpdate: "周五 20:30", nextEpisode: "第 7 集", rating: "8.0", genres: ["悬疑", "奇幻"],
    description: "地图上没有标记的车站，只在风向改变时出现。每一位下车的乘客，都带着一段不愿回忆的往事。",
    palette: "from-emerald-700 via-teal-950 to-slate-950", artwork: "风之\n车站",
    recentEpisodes: [{ episode: "第 6 集", title: "逆风而行", updatedAt: "10月9日 20:42" }, { episode: "第 5 集", title: "无人站台", updatedAt: "10月2日" }, { episode: "第 4 集", title: "车票背面", updatedAt: "9月25日" }],
  },
  {
    id: "anime-08", title: "浮岛日记", originalTitle: "Floating Island Journal", status: "已完结", currentEpisode: 10, totalEpisodes: 10, nextUpdate: "已完结", nextEpisode: "全 10 集", rating: "8.7", genres: ["冒险", "日常"],
    description: "一名地理课实习老师和学生们登上漂浮的岛屿，记录每座岛独有的季节与生活方式。",
    palette: "from-lime-700 via-green-950 to-stone-950", artwork: "浮岛\n日记",
    recentEpisodes: [{ episode: "第 10 集", title: "地图之外", updatedAt: "9月18日" }, { episode: "第 9 集", title: "岛屿的名字", updatedAt: "9月11日" }, { episode: "第 8 集", title: "返航准备", updatedAt: "9月4日" }],
  },
]
