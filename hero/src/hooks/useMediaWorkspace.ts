import { useEffect, useMemo, useRef, useState } from "react";

import { resolvePage } from "../lib/parity";

import {
  ApiError,
  clearCache,
  read,
  readSession,
  request,
  save,
  service,
  SESSION,
  type Download,
  type Session,
  type TV,
  type TVDraft,
} from "../lib/media-service";

import type { MediaSummary } from "../lib/media-contract";

import { errorText } from "../lib/formatters";

import type { Page } from "../layouts/MediaApp";
export function useMediaWorkspace() {
  const [session, setSession] = useState<Session | null>(readSession);
  const [liveLogin, setLiveLogin] = useState(true);
  const [page, setPage] = useState<Page>(() => {
    const hash = window.location.hash.slice(2);
    return resolvePage(hash) as Page;
  });
  const [catalogVisited, setCatalogVisited] = useState<string[]>(
    page === "discover" || page === "rankings" ? [page] : [],
  );
  useEffect(() => {
    if (page === "discover" || page === "rankings")
      setCatalogVisited((current) =>
        current.includes(page) ? current : [...current, page],
      );
  }, [page]);
  const [searchVisited, setSearchVisited] = useState(page === "search");
  useEffect(() => {
    if (page === "search") setSearchVisited(true);
  }, [page]);
  const [mobile, setMobile] = useState(false);
  const [dark, setDark] = useState(() => read("mediahub.hero.dark", false));
  const [toast, setToast] = useState("");
  const [error, setError] = useState("");
  const [subscriptions, setSubscriptions] = useState<TV[]>([]);
  const [tvLoading, setTVLoading] = useState(false);
  const tvVersion = useRef(0);
  const [downloads, setDownloads] = useState<Download[]>([]);
  const [detail, setDetailState] = useState<MediaSummary | null>(null);
  const detailScroll = useRef<{top: number; page: Page} | null>(null);
  function setDetail(value: MediaSummary | null) {
    if (value && !detail) detailScroll.current = {top: window.scrollY, page};
    setDetailState(value);
  }
  useEffect(() => {
    if (detail) {
      window.scrollTo(0, 0);
    } else if (!detail && detailScroll.current) {
      const saved = detailScroll.current;
      detailScroll.current = null;
      if (saved.page === page) {
        const frame = requestAnimationFrame(() => window.scrollTo(0, saved.top));
        return () => cancelAnimationFrame(frame);
      }
    }
  }, [detail, page]);
  const [edit, setEdit] = useState<TV | TVDraft | null>(null);
  const [tvDownload, setTVDownload] = useState<{
    tv: TV;
    resource: TV["resources"][number];
  } | null>(null);
  const [searchBack, setSearchBack] = useState(false);
  const [resourceQuery, setResourceQuery] = useState("");
  const [resourceMedia, setResourceMedia] = useState<MediaSummary | null>(null);
  const api = useMemo(() => (session ? service(session) : null), [session]);
  const notify = (message: string) => setToast(message);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    save("mediahub.hero.dark", dark);
  }, [dark]);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(""), 4000);
    return () => clearTimeout(id);
  }, [toast]);
  useEffect(() => {
    const change = () => {
      const hash = window.location.hash.slice(2);
      setPage(resolvePage(hash) as Page);
      setDetail(null);
    };
    window.addEventListener("hashchange", change);
    return () => window.removeEventListener("hashchange", change);
  }, []);
  useEffect(() => {
    if (!api) return;
    let active = true;
    setTVLoading(true);
    setError("");
    Promise.allSettled([api.tv(), api.downloads()])
      .then(([tv, tasks]) => {
        if (active) {
          if (tv.status === "fulfilled") setSubscriptions(tv.value);
          if (tasks.status === "fulfilled") setDownloads(tasks.value);
          const failures = [tv, tasks].filter((r) => r.status === "rejected");
          if (failures.length)
            setError(failures.map((r) => errorText(r.reason)).join("；"));
          if (
            failures.some(
              (r) => r.reason instanceof ApiError && r.reason.status === 401,
            )
          )
            logout();
        }
      })
      .catch((e) => {
        if (active) {
          setError(errorText(e));
          if (e instanceof ApiError && e.status === 401) logout();
        }
      })
      .finally(() => {
        if (active) setTVLoading(false);
      });
    return () => {
      active = false;
    };
  }, [api]);
  useEffect(() => {
    if (session?.mode !== "live") return;
    let active = true;
    request("/api/auth/me", session).catch((e) => {
      if (active && e instanceof ApiError && e.status === 401) logout();
    });
    return () => {
      active = false;
    };
  }, [session]);
  useEffect(() => {
    if (
      !api ||
      session?.mode !== "live" ||
      edit ||
      !["subscriptions", "calendar"].includes(page)
    )
      return;
    let active = true;
    const timer = setInterval(() => {
      const version = tvVersion.current;
      api
        .tv()
        .then((items) => {
          if (active && version === tvVersion.current) setSubscriptions(items);
        })
        .catch((e) => {
          if (active) setError(errorText(e));
        });
    }, 30000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [api, session, page, edit]);
  function login(s: Session, remember = false) {
    clearCache();
    localStorage.removeItem(SESSION);
    sessionStorage.removeItem(SESSION);
    (remember ? localStorage : sessionStorage).setItem(
      SESSION,
      JSON.stringify(s),
    );
    setSession(s);
    setError("");
    window.scrollTo(0, 0);
  }
  function logout() {
    if (session?.mode === "live")
      void request("/api/auth/logout", session, "POST").catch(() => {});
    localStorage.removeItem(SESSION);
    sessionStorage.removeItem(SESSION);
    sessionStorage.removeItem("mediahub.hero.resource-result");
    clearCache();
    setSession(null);
    setDetail(null);
    setEdit(null);
    setSubscriptions([]);
    setDownloads([]);
    setMobile(false);
  }
  function go(p: Page) {
    p = resolvePage(p) as Page;
    window.location.hash = `/${p}`;
    setPage(p);
    setMobile(false);
    setError("");
    setDetail(null);
    window.scrollTo(0, 0);
  }
  function searchFor(title: string, media = detail) {
    setSearchBack(page === "discover");
    setResourceMedia(media);
    setDetail(null);
    setResourceQuery(title);
    go("search");
  }
  function updateTV(items: TV[]) {
    setSubscriptions(items);
    if (session?.mode === "demo") save("mediahub.hero.tv", items);
  }
  async function saveTV(draft: TVDraft) {
    if (!api || !session) return;
    tvVersion.current++;
    const id = edit && "id" in edit ? edit.id : undefined;
    const result =
      session.mode === "live"
        ? await api.saveTV(draft, id)
        : {
            ...(id
              ? subscriptions.find((s) => s.id === id)!
              : {
                  id: crypto.randomUUID(),
                  poster: "",
                  episodes: [],
                  resources: [],
                  lastCheckedAt: "",
                  nextCheckAt: "",
                  lastError: "",
                  metadataError: "",
                }),
            ...draft,
          };
    updateTV(
      id
        ? subscriptions.map((s) => (s.id === id ? result : s))
        : [...subscriptions, result],
    );
    setEdit(null);
    notify(id ? "订阅规则已保存" : "已加入电视剧订阅");
  }
  async function tvAction(tv: TV, action: "toggle" | "refresh" | "remove") {
    if (!api || !session) return;
    tvVersion.current++;
    try {
      if (action === "remove") {
        if (session.mode === "live") await api.removeTV(tv.id);
        updateTV(subscriptions.filter((s) => s.id !== tv.id));
        notify("已删除订阅");
        return;
      }
      const result =
        session.mode === "live"
          ? action === "refresh"
            ? await api.refreshTV(tv.id)
            : await api.saveTV({ ...tv, enabled: !tv.enabled }, tv.id)
          : action === "refresh"
            ? { ...tv, lastCheckedAt: new Date().toISOString() }
            : { ...tv, enabled: !tv.enabled };
      updateTV(subscriptions.map((s) => (s.id === tv.id ? result : s)));
      notify(
        action === "refresh"
          ? session.mode === "demo"
            ? "演示检查已完成，没有调用外部搜索"
            : "检查已完成"
          : result.enabled
            ? "已恢复订阅"
            : "已暂停订阅",
      );
    } catch (e) {
      notify(errorText(e));
    }
  }

  return {
    session,
    liveLogin,
    setLiveLogin,
    page,
    catalogVisited,
    searchVisited,
    mobile,
    setMobile,
    dark,
    setDark,
    toast,
    setToast,
    error,
    setError,
    subscriptions,
    setSubscriptions,
    tvLoading,
    setTVLoading,
    tvVersion,
    downloads,
    setDownloads,
    detail,
    setDetail,
    edit,
    setEdit,
    tvDownload,
    setTVDownload,
    searchBack,
    resourceQuery,
    resourceMedia,
    api,
    notify,
    login,
    logout,
    go,
    searchFor,
    saveTV,
    tvAction,
  };
}
