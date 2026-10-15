export const sources = [
  ["tmdb", "TMDB"],
  ["douban", "豆瓣"],
  ["anilist", "AniList"],
  ["bangumi", "Bangumi"],
];

export const charts: Record<string, string[][]> = {
  tmdb: [
    ["movie_day", "电影 · 今日趋势"],
    ["tv_day", "剧集 · 今日趋势"],
    ["movie_week", "电影 · 本周趋势"],
    ["tv_week", "剧集 · 本周趋势"],
    ["movie_popular", "热门电影"],
    ["tv_popular", "热门剧集"],
    ["movie_top", "高分电影"],
    ["tv_top", "高分剧集"],
    ["movie_now", "正在上映"],
    ["movie_upcoming", "即将上映"],
    ["tv_airing", "今日播出"],
    ["tv_on_air", "近期播出"],
  ],
  douban: [
    ["movie_top250", "电影 Top 250"],
    ["tv_hot", "热门剧集"],
  ],
  anilist: [
    ["popularity", "人气动画"],
    ["trending", "趋势动画"],
    ["score", "高分动画"],
  ],
  bangumi: [
    ["rank", "动画排名"],
    ["airing", "今日放送"],
  ],
};

export const rankingDescriptions: Record<string, string> = {
  movie_day: "TMDB 全球电影今日趋势",
  tv_day: "TMDB 全球剧集今日趋势",
  movie_week: "TMDB 全球电影本周趋势",
  tv_week: "TMDB 全球剧集本周趋势",
  movie_popular: "按 TMDB 热度排序",
  tv_popular: "按 TMDB 热度排序",
  movie_top: "TMDB 高分电影榜",
  tv_top: "TMDB 高分剧集榜",
  movie_now: "TMDB 正在上映电影",
  movie_upcoming: "TMDB 即将上映电影",
  tv_airing: "TMDB 今日播出剧集",
  tv_on_air: "TMDB 近期播出剧集",
  movie_top250: "豆瓣电影 Top 250 · 展示榜首 20 部",
  tv_hot: "豆瓣热门剧集",
  popularity: "按 AniList 累计人气排序",
  trending: "按 AniList 当前趋势排序",
  score: "按 AniList 评分排序",
  rank: "Bangumi 动画评分排名",
  airing: "按北京时间选取当天星期的放送表，不代表热度排名",
};
export const sourceLinks: Record<string, string> = {
  tmdb: "https://www.themoviedb.org/",
  douban: "https://movie.douban.com/",
  anilist: "https://anilist.co/",
  bangumi: "https://bgm.tv/",
  streaming: "https://www.justwatch.com/",
};
