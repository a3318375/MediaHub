import { useEffect, useState } from "react";
import { Button, Card, Chip, Input } from "@heroui/react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Film,
  Plus,
  RefreshCw,
  Search,
} from "lucide-react";
import { Overlay } from "./App";
import { image, type Platform } from "./media-service";
import type {
  MediaSummary,
  MediaDetail,
  ProviderCapabilities,
} from "./media-contract";
import {
  errorText,
  FilterTabs,
  PosterGrid,
  Poster,
  kindLabels,
  type API,
} from "./MediaUI";
const sources = [
  ["tmdb", "TMDB"],
  ["douban", "豆瓣"],
  ["anilist", "AniList"],
  ["bangumi", "Bangumi"],
];
const charts: Record<string, string[][]> = {
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

export function HomeRecommendations({
  api,
  open,
}: {
  api: API;
  open: (m: MediaSummary) => void;
}) {
  const [items, setItems] = useState<MediaSummary[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    api
      .ranking("tmdb", "movie_day")
      .then((v) => {
        if (active) setItems(v.slice(0, 6));
      })
      .catch((e) => {
        if (active) setError(errorText(e));
      });
    return () => {
      active = false;
    };
  }, [api]);
  return error ? (
    <p role="alert" className="media-error">
      {error}
    </p>
  ) : (
    <PosterGrid items={items} open={open} />
  );
}

export function Discovery({
  ranking,
  api,
  demo,
  open,
}: {
  ranking: boolean;
  api: API;
  demo: boolean;
  open: (m: MediaSummary) => void;
}) {
  const [source, setSource] = useState("tmdb");
  const [chart, setChart] = useState("movie_day");
  const [type, setType] = useState("movie");
  const [region, setRegion] = useState("US");
  const [platform, setPlatform] = useState("");
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [platformError, setPlatformError] = useState("");
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [capabilities, setCapabilities] = useState<ProviderCapabilities[]>([]);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [items, setItems] = useState<MediaSummary[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const capability = capabilities.find((c) => c.source === source);
  useEffect(() => {
    if (demo) return;
    let active = true;
    api
      .providers()
      .then((r) => {
        if (active) setCapabilities(r.providers);
      })
      .catch((e) => {
        if (active) setError(errorText(e));
      });
    return () => {
      active = false;
    };
  }, [api, demo]);
  useEffect(() => {
    if (!ranking) return;
    let active = true;
    setPlatformError("");
    api
      .platforms(type === "movie" ? "movie" : "tv", region)
      .then((v) => {
        if (active) {
          setPlatforms(v);
          setPlatform((current) =>
            v.some((p) => String(p.id) === current)
              ? current
              : v[0]?.id.toString() || "",
          );
        }
      })
      .catch((e) => {
        if (active) {
          setPlatforms([]);
          setPlatform("");
          setPlatformError(errorText(e));
        }
      });
    return () => {
      active = false;
    };
  }, [api, type, region, ranking]);
  useEffect(() => {
    let active = true;
    setBusy(true);
    setError("");
    setItems([]);
    if (source === "streaming" && !platform) {
      setBusy(false);
      return;
    }
    const name =
      source === "streaming"
        ? `platform_${type}_${region}_${platform}_flatrate`
        : chart;
    const load = ranking
      ? api.ranking(
          source === "streaming" ? "tmdb" : source,
          name,
          revision > 0,
        )
      : api
          .discover(
            {
              source,
              mediaType: type,
              query: search,
              page: String(page),
              pageSize: "24",
              ...filters,
            },
            revision > 0,
          )
          .then((r) => {
            if (active) setHasMore(r.hasMore);
            return r.items;
          });
    load
      .then((v) => {
        if (active)
          setItems(
            demo
              ? v.filter((m) =>
                  !ranking
                    ? true
                    : source === "anilist" || source === "bangumi"
                      ? m.mediaType === "anime"
                      : name.startsWith("tv") || name.includes("_tv_")
                        ? m.mediaType === "tv"
                        : m.mediaType === "movie",
                )
              : v,
          );
      })
      .catch((e) => {
        if (active) setError(errorText(e));
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [
    api,
    source,
    chart,
    type,
    region,
    platform,
    search,
    page,
    filters,
    ranking,
    revision,
    demo,
  ]);
  function chooseSource(id: string) {
    setSource(id);
    setChart(charts[id]?.[0][0] || "");
    setPage(1);
    setFilters({});
    setSearch("");
    setQuery("");
    setType(id === "anilist" || id === "bangumi" ? "anime" : "movie");
  }
  const mediaTypes =
    capability?.mediaTypes.filter((t) => t !== "person") ||
    (source === "anilist" || source === "bangumi"
      ? ["anime"]
      : ["movie", "tv"]);
  return (
    <>
      <div className="media-source-grid">
        {sources.map(([id, label]) => (
          <button
            key={id}
            onClick={() => chooseSource(id)}
            className={`media-source ${source === id ? "selected" : ""}`}
          >
            <img src={`/icons/${id}.svg`} alt="" />
            <span>
              {label}
              <small>
                {id === "tmdb"
                  ? "全球影视资料"
                  : id === "douban"
                    ? "华语口碑榜单"
                    : "动画与番剧"}
              </small>
            </span>
            {source === id && <Check size={16} />}
          </button>
        ))}
        {ranking &&
          platforms
            .filter((p) => /netflix|disney|prime|apple|hbo|max/i.test(p.name))
            .slice(0, 5)
            .map((p) => (
              <button
                key={p.id}
                className={`media-source ${source === "streaming" && platform === String(p.id) ? "selected" : ""}`}
                onClick={() => {
                  setSource("streaming");
                  setPlatform(String(p.id));
                  setType("movie");
                }}
              >
                {p.logo ? (
                  <img src={image(p.logo)} alt="" />
                ) : (
                  <span className="platform-letter">{p.name.slice(0, 1)}</span>
                )}
                <span>
                  {p.name}
                  <small>平台片库</small>
                </span>
              </button>
            ))}
        {ranking && (
          <button
            className={`media-source ${source === "streaming" ? "selected" : ""}`}
            onClick={() => {
              setSource("streaming");
              setType("movie");
            }}
          >
            <span className="platform-letter">
              <Film size={22} />
            </span>
            <span>
              更多平台<small>按地区查看</small>
            </span>
          </button>
        )}
      </div>
      <Card className="media-filter-card">
        {source === "streaming" ? (
          <>
            {platformError && (
              <p role="alert" className="media-error">
                {platformError}
              </p>
            )}
            <FilterTabs
              label="作品类型"
              value={type}
              options={[
                ["movie", "电影"],
                ["tv", "剧集"],
              ]}
              onChange={setType}
            />
            <FilterTabs
              label="地区"
              value={region}
              options={[
                ["US", "美国"],
                ["CN", "中国大陆"],
                ["HK", "香港"],
                ["TW", "台湾"],
                ["JP", "日本"],
                ["KR", "韩国"],
                ["GB", "英国"],
              ]}
              onChange={setRegion}
            />
            {platforms.length > 0 && (
              <FilterTabs
                label="平台"
                value={platform}
                options={platforms.map((p) => [String(p.id), p.name])}
                onChange={setPlatform}
              />
            )}
            <p className="media-note">
              按 TMDB
              热度排序的平台片库，受地区与订阅服务可用性影响；并非各平台官方 Top
              10。
            </p>
          </>
        ) : ranking ? (
          <FilterTabs
            label="榜单"
            value={chart}
            options={charts[source]}
            onChange={setChart}
          />
        ) : (
          <>
            <FilterTabs
              label="作品类型"
              value={type}
              options={mediaTypes.map((t) => [t, kindLabels[t] || t])}
              onChange={(v) => {
                setType(v);
                setPage(1);
                setFilters({});
              }}
            />
            {capability?.filters.year && (
              <FilterTabs
                label="年份"
                value={filters.year || ""}
                options={[
                  ["", "全部"],
                  ...Array.from(
                    {
                      length: Math.min(
                        12,
                        capability.filters.year.max -
                          capability.filters.year.min +
                          1,
                      ),
                    },
                    (_, i) => {
                      const year = String(capability.filters.year!.max - i);
                      return [year, year];
                    },
                  ),
                ]}
                onChange={(v) => {
                  setFilters((old) => {
                    const next = { ...old };
                    if (v) next.year = v;
                    else delete next.year;
                    return next;
                  });
                  setPage(1);
                }}
              />
            )}
            {capability?.filters.month && (
              <FilterTabs
                label="月份"
                value={filters.month || ""}
                options={[
                  ["", "全部"],
                  ...Array.from({ length: 12 }, (_, i) => [
                    String(i + 1),
                    `${i + 1} 月`,
                  ]),
                ]}
                onChange={(v) => {
                  setFilters((old) => {
                    const next = { ...old };
                    if (v) next.month = v;
                    else delete next.month;
                    return next;
                  });
                  setPage(1);
                }}
              />
            )}
            {capability &&
              Object.entries(capability.filters)
                .filter(
                  ([k, v]) =>
                    ["genre", "region", "sort", "season", "status"].includes(
                      k,
                    ) &&
                    Array.isArray(v) &&
                    v.length > 0,
                )
                .map(([key, values]) => (
                  <FilterTabs
                    key={key}
                    label={
                      (
                        {
                          genre: "类型",
                          region: "地区",
                          sort: "排序",
                          season: "季度",
                          status: "状态",
                        } as Record<string, string>
                      )[key]
                    }
                    value={filters[key] || ""}
                    options={[
                      ["", "全部"],
                      ...(values as string[]).map((v) => [v, v]),
                    ]}
                    onChange={(v) => {
                      setFilters((old) => {
                        const next = { ...old };
                        if (v) next[key] = v;
                        else delete next[key];
                        return next;
                      });
                      setPage(1);
                    }}
                  />
                ))}
            <form
              className="media-query"
              onSubmit={(e) => {
                e.preventDefault();
                setSearch(query.trim());
                setPage(1);
              }}
            >
              <Input
                aria-label="搜索影视作品"
                placeholder="搜索作品名称…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <Button type="submit">
                <Search size={16} />
                搜索
              </Button>
            </form>
          </>
        )}
      </Card>
      <div className="media-section-heading">
        <h2>
          {ranking
            ? source === "streaming"
              ? platforms.find((p) => String(p.id) === platform)?.name ||
                "平台片库"
              : charts[source]?.find((c) => c[0] === chart)?.[1]
            : search
              ? `“${search}” 的结果`
              : "发现作品"}
          <small>{!busy && `${items.length} 部作品`}</small>
        </h2>
        <Button
          variant="secondary"
          size="sm"
          isDisabled={busy}
          onPress={() => setRevision((v) => v + 1)}
        >
          <RefreshCw size={14} />
          刷新
        </Button>
      </div>
      {demo && (
        <p className="media-note">
          当前为本地示例资料，用于预览布局与交互；切换服务模式可查看真实来源数据。
        </p>
      )}
      {error ? (
        <div role="alert" className="media-error">
          {error}
          <Button variant="ghost" onPress={() => setRevision((v) => v + 1)}>
            重试
          </Button>
        </div>
      ) : busy ? (
        <div className="poster-grid" aria-label="正在加载作品">
          {Array.from({ length: 6 }, (_, i) => (
            <div className="poster-skeleton" key={i} />
          ))}
        </div>
      ) : (
        <PosterGrid items={items} open={open} />
      )}
      {!ranking && (
        <div className="media-pagination">
          <Button
            variant="secondary"
            isDisabled={page === 1 || busy}
            onPress={() => setPage((p) => p - 1)}
          >
            <ChevronLeft size={15} />
            上一页
          </Button>
          <span>第 {page} 页</span>
          <Button
            variant="secondary"
            isDisabled={!hasMore || busy}
            onPress={() => setPage((p) => p + 1)}
          >
            下一页
            <ChevronRight size={15} />
          </Button>
        </div>
      )}
    </>
  );
}

export function Detail({
  media,
  api,
  close,
  search,
  subscribe,
}: {
  media: MediaSummary;
  api: API;
  close: () => void;
  search: (q: string) => void;
  subscribe: (m: MediaSummary) => void;
}) {
  const [data, setData] = useState<MediaDetail>(media);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    api
      .detail(media)
      .then((v) => {
        if (active) setData(v);
      })
      .catch((e) => {
        if (active) setError(errorText(e));
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [api, media]);
  return (
    <Overlay
      title={data.title}
      onClose={close}
      footer={
        <>
          <Button variant="secondary" onPress={() => search(data.title)}>
            <Search size={15} />
            搜索资源
          </Button>
          {data.source === "tmdb" && data.mediaType === "tv" && (
            <Button onPress={() => subscribe(data)}>
              <Plus size={15} />
              订阅此剧
            </Button>
          )}
        </>
      }
    >
      <div className="media-detail">
        <div className="media-detail-poster">
          <Poster media={data} onOpen={() => {}} />
        </div>
        <div>
          <p>{data.originalTitle}</p>
          <p>
            {data.year} · {data.genres.join(" / ")}
          </p>
          <div className="media-ratings">
            {data.ratings.map((r) => (
              <Chip key={r.source} variant="soft">
                {r.source.toUpperCase()} · {r.value}
              </Chip>
            ))}
          </div>
          <p>{busy ? "正在加载详情…" : data.overview || "暂无简介"}</p>
          {data.credits?.length ? (
            <p className="media-note">
              演职员：
              {data.credits
                .slice(0, 8)
                .map((c) => `${c.name}（${c.role}）`)
                .join("、")}
            </p>
          ) : null}
          {data.seasons?.length ? (
            <p className="media-note">
              已收录：
              {data.seasons
                .map((s) => s.name || `第 ${s.seasonNumber} 季`)
                .join("、")}
            </p>
          ) : null}
          {error && (
            <p role="alert" className="media-error">
              {error}
            </p>
          )}
        </div>
      </div>
    </Overlay>
  );
}
