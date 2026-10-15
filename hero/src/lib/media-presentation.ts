const countryNames: Record<string, string> = {
  CN: "大陆",
  HK: "香港",
  TW: "台湾",
  JP: "日本",
  KR: "韩国",
  US: "美国",
  GB: "英国",
};

export function formatRegion(countries?: string[], region?: string): string {
  const codes = countries?.length ? countries : (region ?? "").split(",");
  return codes
    .map((code) => code.trim())
    .filter(Boolean)
    .map((code) => countryNames[code] ?? code)
    .join("、");
}

// Kana distinguishes Japanese native titles from Chinese CJK titles.
export function isChineseTitle(value?: string): boolean {
  return Boolean(
    value &&
    /[\u3400-\u9fff]/u.test(value) &&
    !/[\u3040-\u30ff\uac00-\ud7af]/u.test(value),
  );
}
type TitleInput = {
  provider?: string;
  source?: string;
  title: string;
  originalTitle?: string;
  titles?: {
    native?: string;
    english?: string;
    romaji?: string;
    synonyms?: string[];
  };
};
export function presentTitle(media: TitleInput): {
  title: string;
  subtitle?: string;
} {
  const titles = media.titles;
  const title =
    (media.provider ?? media.source) === "anilist"
      ? titles?.synonyms?.find(isChineseTitle) ||
        (isChineseTitle(titles?.native) ? titles?.native : undefined) ||
        (isChineseTitle(media.title) ? media.title : undefined) ||
        titles?.romaji ||
        titles?.english ||
        titles?.native ||
        media.title
      : media.title;
  const subtitle = [
    media.originalTitle,
    titles?.romaji,
    titles?.native,
    titles?.english,
  ].find((value) => value && value !== title);
  return { title, subtitle };
}
export function mediaImageUrl(
  path?: string | null,
  size = "w342",
): string | undefined {
  if (!path?.trim()) return undefined;
  // 后端已给出本站代理路径（例如豆瓣图片代理），直接使用，不要再拼图片 CDN 前缀。
  if (path.startsWith("/api/")) return path;
  if (/^https?:\/\//i.test(path)) {
    const url = new URL(path);
    if (/^img[1239]\.doubanio\.com$/i.test(url.hostname))
      return `/api/media/image?source=douban&url=${encodeURIComponent(path)}`;
    return path;
  }
  return `https://image.tmdb.org/t/p/${size}${path.startsWith("/") ? path : `/${path}`}`;
}
export function formatResultTotal(
  total: number | null,
  totalCapped = false,
): string {
  if (total === null) return " · 数量由上游决定";
  return totalCapped
    ? ` · 共 ${total}+ 部作品（上游上限）`
    : ` · 共 ${total} 部作品`;
}

export function presentMediaError(
  status: number,
  message: string,
  retryAfter: string | null = null,
): string {
  const labels: Record<number, string> = {
    400: "筛选参数或组合不受支持",
    401: "会话已失效，请重新登录",
    404: "作品不存在",
    429: "本服务请求过于频繁，请稍后重试",
    502: "上游服务异常",
    503: "数据源暂不可用",
    504: "上游请求超时，请重试",
  };
  const label = labels[status] ?? `服务错误 (${status})`;
  const detail = message.trim();
  const semantics: Record<number, RegExp> = {
    400: /筛选.*不.*支持|参数.*不.*支持/,
    401: /会话.*失效|重新登录/,
    404: /作品不存在|未找到.*(作品|媒体)/,
    429: /请求.*频繁|限流/,
    502: /上游.*异常/,
    503: /数据源.*不可用/,
    504: /上游.*超时/,
  };
  const text =
    !detail || label.includes(detail)
      ? label
      : semantics[status]?.test(detail)
        ? detail
        : `${label}：${detail}`;
  return `${text}${retryAfter ? `（Retry-After：${retryAfter}）` : ""}`;
}
