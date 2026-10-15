import { useEffect, useState } from "react";
import { charts } from "../lib/catalog-options";
import { errorText, type API } from "../lib/formatters";
import type { MediaSummary, ProviderCapabilities } from "../lib/media-contract";
import { type Platform } from "../lib/media-service";
import { readMediaSearchHistory } from "../lib/resource-search";
export function useDiscovery({
  ranking,
  api,
  demo,
}: {
  ranking: boolean;
  api: API;
  demo: boolean;
  open: (m: MediaSummary) => void;
  search: (m: MediaSummary) => void;
  subscribe: (m: MediaSummary) => void;
}) {
  const [source, setSource] = useState("tmdb");
  const [chart, setChart] = useState("movie_day");
  const [type, setType] = useState(ranking ? "tv" : "movie");
  const [region, setRegion] = useState("US");
  const [monetization, setMonetization] = useState("flatrate");
  const [platformQuery, setPlatformQuery] = useState("");
  const [platform, setPlatform] = useState("");
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [platformError, setPlatformError] = useState("");
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [history, setHistory] = useState(() =>
    readMediaSearchHistory(localStorage),
  );
  const [capabilities, setCapabilities] = useState<ProviderCapabilities[]>([]);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState<number | null>(null);
  const [totalCapped, setTotalCapped] = useState(false);
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
        if (!active) return;
        setCapabilities(r.providers);
        if (!ranking) {
          const available =
            r.providers.find((p) => p.source === source && p.available) ||
            r.providers.find((p) => p.available);
          if (!available) {
            setError(
              `当前没有可用数据源。${r.providers[0]?.unavailableReason || ""}`,
            );
            setBusy(false);
            return;
          }
          setSource(available.source);
          setType((current) =>
            available.mediaTypes.includes(current as never)
              ? current
              : available.mediaTypes[0],
          );
        }
      })
      .catch((e) => {
        if (active) {
          setError(errorText(e));
          setBusy(false);
        }
      });
    return () => {
      active = false;
    };
  }, [api, demo, ranking, revision]);
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
  }, [api, type, region, ranking, revision]);
  useEffect(() => {
    if (!ranking && !demo && !capability?.available) return;
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
        ? `platform_${type}_${region}_${platform}_${monetization}`
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
              pageSize: String(Math.min(20, capability?.pageSizeMax || 20)),
              ...filters,
            },
            revision > 0,
          )
          .then((r) => {
            if (active) {
              setHasMore(r.hasMore);
              setTotal(r.total);
              setTotalCapped(r.totalCapped);
            }
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
    monetization,
    search,
    page,
    filters,
    ranking,
    revision,
    demo,
    capability,
  ]);
  function chooseSource(id: string) {
    setSource(id);
    setChart(charts[id]?.[0][0] || "");
    setPage(1);
    setFilters({});
    setSearch("");
    setQuery("");
    setType(
      capabilities.find((c) => c.source === id)?.mediaTypes[0] ||
        (id === "anilist" || id === "bangumi" ? "anime" : "movie"),
    );
  }
  const mediaTypes =
    capability?.mediaTypes.filter((t) => t !== "person") ||
    (source === "anilist" || source === "bangumi"
      ? ["anime"]
      : ["movie", "tv"]);

  return {
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
    page,
    setPage,
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
  };
}
