import { type service } from "./media-service";

export type API = ReturnType<typeof service>;

export const kindLabels: Record<string, string> = {
  movie: "电影",
  tv: "剧集",
  anime: "动画",
  documentary: "纪录片",
};

export function errorText(e: unknown) {
  return e instanceof Error ? e.message : "请求失败，请重试";
}

export function dateCN(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function time(value: string) {
  return value
    ? new Date(value).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })
    : "尚未检查";
}
