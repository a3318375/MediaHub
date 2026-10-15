// Product structure follows web/src/layouts/media-shell/navigation-data.ts.
export const navigationItems = [
  ["emby", "Emby 看板", "首页"],
  ["search", "搜索历史", "首页"],
  ["discover", "影视探索", "功能模块"],
  ["rankings", "榜单推荐", "功能模块"],
  ["anime", "动漫订阅", "功能模块"],
  ["calendar", "追剧日历", "功能模块"],
  ["logs", "日志中心", "功能模块"],
  ["settings", "全局设置", "管理"],
] as const;
export const settingsTabs = [
  ["basic", "基础配置"],
  ["organize", "媒体整理"],
  ["search", "搜索规则"],
  ["pansou", "资源搜索"],
  ["account", "账号与安全"],
  ["api-keys", "API 密钥"],
  ["notifications", "通知与机器人"],
];
export function resolvePage(value: string) {
  const originalPaths: Record<string, string> = {
    "discover/explore": "discover",
    "discover/rankings": "rankings",
    "discover/anime": "anime",
    "discover/calendar": "calendar",
    "tools/logs": "logs",
    "tools/downloads": "settings",
    "tools/organize": "settings",
  };
  value = originalPaths[value] || value;
  if (value === "home") return "emby";
  if (value === "subscriptions") return "calendar";
  if (value === "downloads" || value === "organize") return "settings";
  return navigationItems.some(([id]) => id === value) ? value : "emby";
}
export const cloudLabels: Record<string, string> = {
  baidu: "百度网盘",
  aliyun: "阿里云盘",
  "115": "115 网盘",
  "123": "123 网盘",
  quark: "夸克网盘",
  xunlei: "迅雷网盘",
  tianyi: "天翼云盘",
  uc: "UC 网盘",
  mobile: "移动云盘",
  pikpak: "PikPak",
  magnet: "磁力链接",
  ed2k: "电驴链接",
  guangya: "光鸭云盘",
  others: "其他",
};
