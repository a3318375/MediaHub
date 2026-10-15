import { type SettingsSection, type SettingValue } from "./settings-api";

type Schema = [string, string, SettingValue, "secret"?];

export const schemas: Record<SettingsSection, Schema[]> = {
  tmdb: [["tmdb.apiKey", "TMDB API Key", "", "secret"]],
  emby: [
    ["emby.url", "Emby 地址", ""],
    ["emby.apiKey", "Emby API Key", "", "secret"],
    ["emby.cacheExpirationHours", "缓存时长（小时）", 12],
  ],
  "115": [
    ["115.cookie", "115 Cookie", "", "secret"],
    ["115.downloadDirectory", "默认下载目录", ""],
  ],
  organize: [
    ["organize.enabled", "启用整理", true],
    ["organize.sourcePaths", "来源路径", ""],
    ["organize.moviePath", "电影路径", ""],
    ["organize.tvPath", "剧集路径", ""],
    [
      "organize.movieFormat",
      "电影命名格式",
      "{title} ({year})/{title} ({year})",
    ],
    [
      "organize.tvFormat",
      "剧集命名格式",
      "{title} ({year})/Season {season}/{title} - S{season}E{episode}",
    ],
    ["organize.moveMode", "移动方式", "硬链接，失败时复制"],
    ["organize.skipExisting", "跳过已有文件", true],
  ],
  search: [
    ["search.tmdb", "TMDB 元数据", true],
    ["search.douban", "豆瓣元数据", true],
    ["search.bangumi", "Bangumi 元数据", true],
    ["search.anilist", "AniList 元数据", true],
    ["search.priority", "来源优先级", "TMDB → 豆瓣 → Bangumi → AniList"],
    ["search.auto", "自动搜索订阅", true],
    ["search.interval", "搜索间隔（小时）", "24"],
    ["search.minSeeders", "最少做种数", "2"],
    ["search.quality", "画质偏好", "优先 1080p，允许 2160p"],
    ["search.excludeKeywords", "排除关键词", "预告, 花絮, 样片, 宣传片"],
  ],
  pansou: [],
  notifications: [
    ["notifications.telegramEnabled", "启用 Telegram 通知", false],
    ["notifications.botToken", "机器人 Token", "", "secret"],
    ["notifications.chatId", "Chat ID", ""],
    ["notifications.receiveEnabled", "接收机器人消息", false],
    ["notifications.receiveMode", "接收方式", "长轮询"],
    ["notifications.webhookUrl", "Webhook URL", ""],
    ["notifications.notifyOnComplete", "任务完成时通知", true],
    ["notifications.notifyOnError", "任务失败时通知", true],
  ],
};

export const sectionNames: Record<string, string> = {
  tmdb: "TMDB",
  emby: "Emby",
  "115": "115 网盘",
  search: "搜索规则",
  notifications: "通知与机器人",
};
