import { useEffect, useRef, useState } from "react";
import { mediaContextFromRecord } from "../lib/download-api";
import { errorText, type API } from "../lib/formatters";
import type { MediaSummary } from "../lib/media-contract";
import {
  normalizeResources,
  request,
  type Download,
  type Resource,
  type Resources,
  type Session,
} from "../lib/media-service";
import {
  RESOURCE_SEARCH_CONFIG_CHANGED,
  readMediaSearchHistory,
  readResourceSearchHistory,
  resourceSearchPlan,
  saveResourceSearchHistory,
  type ResourceSearchMeta,
} from "../lib/resource-search";
import {
  mergeResourceResults,
  transferSearchResource,
} from "../lib/resource-workflow";
import { useResourceHealth } from "./useResourceHealth";
export function useResourceSearch({
  api,
  session,
  initialQuery,
  notify,
  onDownloaded,
  media,
}: {
  api: API;
  session: Session;
  initialQuery: string;
  notify: (s: string) => void;
  onDownloaded: (d: Download) => void;
  media?: MediaSummary | null;
  back?: () => void;
}) {
  const [savedResult] = useState<{
    query: string;
    result: Resources;
    cloud: string;
    media?: MediaSummary;
  } | null>(() => {
    if (initialQuery) return null;
    try {
      const saved = JSON.parse(
        sessionStorage.getItem("mediahub.hero.resource-result") || "null",
      );
      return typeof saved?.query === "string" &&
        typeof saved.result?.total === "number" &&
        saved.result?.linksByCloud &&
        typeof saved.cloud === "string"
        ? { ...saved, result: normalizeResources(saved.result) }
        : null;
    } catch {
      return null;
    }
  });
  const [query, setQuery] = useState(initialQuery || savedResult?.query || "");
  const [submitted, setSubmitted] = useState(savedResult?.query || "");
  const [result, setResult] = useState<Resources | null>(
    savedResult?.result || null,
  );
  const [cloud, setCloud] = useState(savedResult?.cloud || "all");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState(() =>
    readResourceSearchHistory(localStorage).map((entry) => entry.keyword),
  );
  const [preferences, setPreferences] = useState<
    ResourceSearchMeta["selection"] | null
  >(null);
  const [autoDetect, setAutoDetect] = useState(false);
  const [updating, setUpdating] = useState(false);
  const searchController = useRef<AbortController | null>(null);
  const [downloading, setDownloading] = useState("");
  const downloadLock = useRef(false);
  const [mediaHistory, setMediaHistory] = useState(() =>
    readMediaSearchHistory(localStorage),
  );
  const context = useRef({
    keyword: initialQuery || savedResult?.query || "",
    media: media || savedResult?.media,
  });
  const searchRun = useRef(0);
  useEffect(
    () => () => {
      searchRun.current++;
      searchController.current?.abort();
    },
    [],
  );
  async function search(value = query, force = false) {
    if (!value.trim()) return;
    const run = ++searchRun.current;
    searchController.current?.abort();
    const controller = new AbortController();
    searchController.current = controller;
    setUpdating(false);
    setBusy(true);
    setError("");
    setSubmitted(value.trim());
    setResult(null);
    try {
      if (value.trim() !== context.current.keyword)
        context.current = { keyword: value.trim(), media: undefined };
      const selection =
        session.mode === "live"
          ? (
              await request<{ data: ResourceSearchMeta }>(
                "/api/v1/resources/meta",
                session,
                "GET",
                undefined,
                30_000,
                controller.signal,
              )
            ).data.selection
          : preferences;
      const plan = selection ? resourceSearchPlan(selection) : null;
      if (plan?.disabled)
        throw new Error("请在全局设置中选择 TG 频道或搜索插件");
      if (run !== searchRun.current || controller.signal.aborted) return;
      const call = async (source: string) =>
        session.mode === "live"
          ? normalizeResources(
              (
                await request<{ data: Resources }>(
                  "/api/v1/resources/search",
                  session,
                  "POST",
                  {
                    query: value.trim(),
                    source,
                    mode: "merge",
                    ...selection,
                    refresh: false,
                  },
                  30_000,
                  controller.signal,
                )
              ).data,
            )
          : api.search(value.trim(), force);
      if (plan?.warmup) void call(plan.fullSource).catch(() => {});
      const r = await call(plan?.firstSource || "all");
      if (run !== searchRun.current) return;
      setResult(r);
      setCloud(
        Object.keys(r.linksByCloud).find((k) => r.linksByCloud[k].length) ||
          "all",
      );
      setHistory(
        saveResourceSearchHistory(localStorage, {
          keyword: value.trim(),
          source: plan?.fullSource || "all",
          mode: "merge",
          cloudTypes: selection?.cloudTypes || [],
          plugins: selection?.plugins || [],
          channels: selection?.channels || [],
          at: Date.now(),
        }).map((entry) => entry.keyword),
      );
      setBusy(false);
      if (session.mode === "live" && plan?.collect) {
        setUpdating(true);
        for (const delay of [2000, 3000, 3000]) {
          await new Promise<void>((resolve) => {
            const stop = () => {
              clearTimeout(timer);
              resolve();
            };
            const timer = setTimeout(() => {
              controller.signal.removeEventListener("abort", stop);
              resolve();
            }, delay);
            controller.signal.addEventListener("abort", stop, { once: true });
          });
          if (run !== searchRun.current || controller.signal.aborted) return;
          try {
            const incoming = await call(plan.fullSource);
            if (run !== searchRun.current || controller.signal.aborted) return;
            setResult((current) =>
              current ? mergeResourceResults(current, incoming) : incoming,
            );
          } catch (e) {
            if (run === searchRun.current && !controller.signal.aborted)
              setError(errorText(e));
          }
        }
      }
    } catch (e) {
      if (run === searchRun.current) setError(errorText(e));
    } finally {
      if (run === searchRun.current) {
        setBusy(false);
        setUpdating(false);
      }
    }
  }
  useEffect(() => {
    if (!result) return;
    try {
      sessionStorage.setItem(
        "mediahub.hero.resource-result",
        JSON.stringify({
          query: submitted,
          result,
          cloud,
          media: context.current.media,
        }),
      );
    } catch {
      /* Keep the in-memory result when storage is unavailable. */
    }
  }, [submitted, result, cloud, media, savedResult]);
  useEffect(() => {
    if (initialQuery) void search(initialQuery);
  }, []);
  const links = Object.entries(result?.linksByCloud || {})
    .filter(([key]) => cloud === "all" || cloud === key)
    .flatMap(([key, values]) =>
      values.map((r) => ({ ...r, cloud: r.cloud || key })),
    );
  useEffect(() => {
    if (session.mode !== "live") return;
    let active = true;
    const load = () =>
      request<{ data: ResourceSearchMeta }>("/api/v1/resources/meta", session)
        .then((r) => {
          if (active) {
            setAutoDetect(r.data.selection.detectionEnabled);
            setPreferences(r.data.selection);
          }
        })
        .catch((e) => {
          if (active) setError(errorText(e));
        });
    void load();
    window.addEventListener(RESOURCE_SEARCH_CONFIG_CHANGED, load);
    return () => {
      active = false;
      window.removeEventListener(RESOURCE_SEARCH_CONFIG_CHANGED, load);
    };
  }, [session]);
  const { health, checking, check } = useResourceHealth(
    links,
    autoDetect,
    session,
    notify,
  );
  useEffect(() => {
    if (!result) return;
    const keys = Object.keys(result.linksByCloud).filter(
      (k) => result.linksByCloud[k].length,
    );
    if (!keys.includes(cloud)) setCloud(keys[0] || "all");
  }, [result, cloud]);
  async function transfer(link: Resource) {
    if (downloadLock.current || session.mode !== "live") return;
    downloadLock.current = true;
    setDownloading(link.url);
    setError("");
    try {
      const m = context.current.media
        ? mediaContextFromRecord(context.current.media)
        : undefined;
      const response = await transferSearchResource(
        link,
        result?.items.find((i) => i.links?.some((l) => l.url === link.url))
          ?.title || submitted,
        m,
      );
      onDownloaded(response.task);
      notify("已加入下载队列，完成后按设置自动整理。");
    } catch (e) {
      setError(errorText(e));
    } finally {
      downloadLock.current = false;
      setDownloading("");
    }
  }
  async function copy(link: Resource) {
    try {
      await navigator.clipboard.writeText(
        `${link.url}${link.password ? ` 提取码：${link.password}` : ""}`,
      );
      notify("链接已复制");
    } catch {
      notify("复制失败，请手动选择链接复制");
    }
  }

  return {
    query,
    setQuery,
    submitted,
    result,
    cloud,
    setCloud,
    error,
    busy,
    history,
    setHistory,
    updating,
    health,
    checking,
    downloading,
    mediaHistory,
    setMediaHistory,
    search,
    links,
    transfer,
    copy,
    check,
  };
}
