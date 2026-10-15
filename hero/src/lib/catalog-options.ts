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
