import { useEffect, useRef, useState } from "react";
import { useDiscovery } from "../../hooks/useDiscovery";

import { Button, Card, Input, Tabs } from "@heroui/react";

import {
  Check,
  Film,
  RefreshCw,
  Search,
} from "lucide-react";

import { image } from "../../lib/media-service";

import {
  commonGenres,
  movieGenres,
  optionLabel,
  regionLabels,
  tvGenres,
} from "../../lib/discovery-labels";

import { saveMediaSearchHistory } from "../../lib/resource-search";

import { Field, SelectField } from "../../components/ui/ManagementUI";

import type { MediaSummary } from "../../lib/media-contract";

import {
  FilterTabs,
  kindLabels,
  PosterGrid,
  type API,
} from "../../components/media/MediaUI";
import {
  charts,
  sources,
  rankingDescriptions,
  sourceLinks,
} from "../../lib/catalog-options";
export { HomeRecommendations } from "../../components/media/HomeRecommendations";
export { Detail } from "./MediaDetail";

export function Discovery({
  ranking,
  api,
  demo,
  open,
  search: searchResource,
  searchKeyword,
  subscribe,
}: {
  ranking: boolean;
  api: API;
  demo: boolean;
  open: (m: MediaSummary) => void;
  search: (m: MediaSummary) => void;
  searchKeyword: (keyword: string) => void;
  subscribe: (m: MediaSummary) => void;
}) {
  const {
    rankingFetchedAt,
    source,
    setSource,
    chart,
    setChart,
    type,
    setType,
    region,
    setRegion,
    monetization,
    setMonetization,
    platformQuery,
    setPlatformQuery,
    platform,
    setPlatform,
    platforms,
    platformError,
    query,
    setQuery,
    search,
    setSearch,
    history,
    setHistory,
    filters,
    setFilters,
    setPage,
    loadMore,
    retryLoad,
    total,
    totalCapped,
    hasMore,
    items,
    busy,
    error,
    setRevision,
    capability,
    capabilities,
    chooseSource,
    mediaTypes,
  } = useDiscovery({
    ranking,
    api,
    demo,
    open,
    search: searchResource,
    subscribe,
  });
  const sentinel = useRef<HTMLDivElement>(null);
  const [showTop, setShowTop] = useState(false);
  useEffect(() => {
    if (ranking) return;
    const update = () => setShowTop(window.scrollY > 650);
    window.addEventListener("scroll", update, {passive: true});
    return () => window.removeEventListener("scroll", update);
  }, [ranking]);
  useEffect(() => {
    if (ranking || busy || error || !hasMore || !sentinel.current) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) loadMore();
    }, {rootMargin: "400px 0px"});
    observer.observe(sentinel.current);
    return () => observer.disconnect();
  }, [ranking, busy, error, hasMore, loadMore]);
  return (
    <>
      {!ranking ? (
        <Tabs
          className="discovery-source-tabs"
          aria-label="影视探索来源"
          selectedKey={source}
          onSelectionChange={(key) => chooseSource(String(key))}
        >
          <Tabs.ListContainer>
            <Tabs.List aria-label="影视探索来源">
              {sources.map(([id, label]) => (
                <Tabs.Tab
                  key={id}
                  id={id}
                  isDisabled={
                    !demo &&
                    !capabilities.find((c) => c.source === id)?.available
                  }
                >
                  {label}
                  <Tabs.Indicator />
                </Tabs.Tab>
              ))}
            </Tabs.List>
          </Tabs.ListContainer>
        </Tabs>
      ) : (
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
              .filter((p) =>
                /^(Netflix|奈飞|奈菲|Disney\+|Disney Plus|Amazon Prime Video|Prime Video|HBO Max|Max|HBO|Apple TV(?:\+| Plus)?|Crunchyroll|Hulu|Amazon Video|Paramount\+|Peacock(?: Premium)?)$/i.test(
                  p.name,
                ),
              )
              .slice(0, 10)
              .map((p) => (
                <button
                  key={p.id}
                  className={`media-source ${source === "streaming" && platform === String(p.id) ? "selected" : ""}`}
                  onClick={() => {
                    setSource("streaming");
                    setPlatform(String(p.id));
                    setType("tv");
                  }}
                >
                  {p.logo ? (
                    <img src={image(p.logo)} alt="" />
                  ) : (
                    <span className="platform-letter">
                      {p.name.slice(0, 1)}
                    </span>
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
                setType("tv");
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
      )}
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
                ["CA", "加拿大"],
                ["AU", "澳大利亚"],
                ["DE", "德国"],
                ["FR", "法国"],
                ["IN", "印度"],
                ["SG", "新加坡"],
              ]}
              onChange={setRegion}
            />
            {platforms.length > 0 && (
              <>
                <Field
                  label="搜索平台"
                  value={platformQuery}
                  onChange={setPlatformQuery}
                />
                <SelectField
                  label="平台"
                  value={platform}
                  options={platforms
                    .filter(
                      (p) =>
                        String(p.id) === platform ||
                        p.name
                          .toLowerCase()
                          .includes(platformQuery.toLowerCase()),
                    )
                    .map((p) => [String(p.id), p.name])}
                  onChange={setPlatform}
                />
              </>
            )}
            <FilterTabs
              label="观看方式"
              value={monetization}
              options={[
                ["flatrate", "订阅"],
                ["free", "免费"],
                ["ads", "含广告"],
                ["rent", "租借"],
                ["buy", "购买"],
              ]}
              onChange={setMonetization}
            />
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
            {capability &&
              (["genre", "region", "season", "status", "sort"] as const)
                .map((key) => [key, capability.filters[key]] as const)
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
                    disabled={!!search}
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
                      ...(values as string[])
                        .filter(
                          (v) =>
                            source !== "tmdb" ||
                            key !== "genre" ||
                            [
                              ...commonGenres,
                              ...(type === "movie" ? movieGenres : tvGenres),
                            ].includes(v),
                        )
                        .map((v) => [
                          v,
                          key === "region"
                            ? regionLabels[v] || v
                            : optionLabel(v),
                        ]),
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
            {capability?.filters.year && (
              <FilterTabs
                disabled={!!search}
                label="年份"
                value={filters.year || ""}
                options={[
                  ["", "全部"],
                  ...Array.from(
                    {
                      length: Math.min(
                        20,
                        Math.min(capability.filters.year.max, new Date().getFullYear()) -
                          capability.filters.year.min +
                          1,
                      ),
                    },
                    (_, i) => {
                      const year = String(Math.min(capability.filters.year!.max, new Date().getFullYear()) - i);
                      return [year, year];
                    },
                  ),
                ]}
                onChange={(v) => {
                  setFilters((old) => {
                    const next = { ...old };
                    if (v) next.year = v;
                    else { delete next.year; delete next.month; }
                    return next;
                  });
                  setPage(1);
                }}
              />
            )}
            {capability?.filters.month && (
              <FilterTabs
                disabled={!!search || !filters.year}
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
            <form
              className="media-query"
              onSubmit={(e) => {
                e.preventDefault();
                if (!query.trim() || (!demo && !capability?.supportsSearch))
                  return;
                searchKeyword(query.trim());
                if (query.trim())
                  setHistory(
                    saveMediaSearchHistory(localStorage, {
                      kind: "media",
                      keyword: query.trim(),
                      source,
                      at: Date.now(),
                    }),
                  );
              }}
            >
              <Input
                aria-label="搜索影视作品"
                disabled={!demo && !capability?.supportsSearch}
                placeholder="搜索作品名称…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <Button
                type="submit"
                isDisabled={!demo && !capability?.supportsSearch}
              >
                <Search size={16} />
                搜索
              </Button>
              <Button
                variant="secondary"
                onPress={() => {
                  setQuery("");
                  setSearch("");
                  setPage(1);
                }}
              >
                清空
              </Button>
              <Button
                variant="secondary"
                onPress={() => {
                  setFilters({});
                  setPage(1);
                }}
              >
                重置
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
          <small>
            {!busy &&
              `${!ranking && total !== null ? `${total}${totalCapped ? "+" : ""}` : items.length} 部作品`}
          </small>
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
      {ranking && (
        <p className="media-note">
          {source === "streaming"
            ? "按 TMDB 热度排序的地区可观看片单"
            : rankingDescriptions[chart]}{" "}
          {rankingFetchedAt &&
            `· 更新于 ${new Date(rankingFetchedAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })} · 北京时间`}{" "}
          ·{" "}
          <a href={sourceLinks[source]} target="_blank" rel="noreferrer">
            {source === "streaming"
              ? "JustWatch"
              : sources.find(([id]) => id === source)?.[1]}
          </a>
        </p>
      )}
      {demo && (
        <p className="media-note">
          当前为本地示例资料，用于预览布局与交互；切换服务模式可查看真实来源数据。
        </p>
      )}
      {error && !items.length ? (
        <div role="alert" className="media-error">
          {error}
          <Button variant="ghost" onPress={retryLoad}>
            重试
          </Button>
        </div>
      ) : busy && !items.length ? (
        <div className="poster-grid" aria-label="正在加载作品">
          {Array.from({ length: 6 }, (_, i) => (
            <div className="poster-skeleton" key={i} />
          ))}
        </div>
      ) : (
        <PosterGrid
          items={items}
          open={open}
          search={searchResource}
          subscribe={subscribe}
          ranking={ranking && !(source === "bangumi" && chart === "airing")}
        />
      )}
      {(source === "tmdb" || source === "streaming") && (
        <p className="media-note">
          This product uses the TMDB API but is not endorsed or certified by
          TMDB.
          {source === "streaming" && (
            <>
              {" "}
              可观看性数据由{" "}
              <a
                href="https://www.justwatch.com/"
                target="_blank"
                rel="noreferrer"
              >
                JustWatch
              </a>{" "}
              提供，片单按 TMDB 热度排序。
            </>
          )}
        </p>
      )}
      {ranking && platformError && source !== "streaming" && (
        <p className="media-note">平台入口暂不可用：{platformError}</p>
      )}
      {!ranking && history.length > 0 && (
        <div className="search-history">
          <span>最近搜索</span>
          {history.slice(0, 8).map((h) => (
            <button
              key={`${h.keyword}-${h.source}`}
              onClick={() => {
                chooseSource(h.source);
                setQuery(h.keyword);
                setSearch(h.keyword);
                setPage(1);
                setFilters({});
              }}
            >
              {h.keyword}
            </button>
          ))}
        </div>
      )}
      {!ranking && <>
        <div ref={sentinel} className="discovery-load-more" aria-live="polite" aria-busy={busy}>
          {busy ? <span>{items.length ? "正在加载更多作品…" : "正在加载作品…"}</span> : error ? <>
            <span role="alert">{error}</span><Button variant="secondary" onPress={retryLoad}>重试加载</Button>
          </> : hasMore ? <><span>已加载 {items.length} 部作品</span><Button variant="secondary" onPress={loadMore}>加载更多</Button></>
          : items.length > 0 ? <span>已展示 {items.length} 部作品 · 已全部加载</span> : null}
        </div>
        {showTop && <Button className="discovery-back-top" variant="secondary" onPress={() => window.scrollTo({top: 0, behavior: "smooth"})}>↑ 回到顶部</Button>}
      </>}
    </>
  );
}
