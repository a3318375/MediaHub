import { lazy, Suspense } from "react";
import { useMediaWorkspace } from "../hooks/useMediaWorkspace";
import {
  navigation,
  WorkspaceHeader,
  WorkspaceSidebar,
} from "./WorkspaceChrome";

import { Button, Card, Chip } from "@heroui/react";

import {
  Check,
  ChevronRight,
  Film,
  Plus,
  RefreshCw,
  Tv,
  X,
} from "lucide-react";

import { navigationItems } from "../lib/parity";

import { Login } from "../mocks/DemoLogin";

import { save, SESSION } from "../lib/media-service";

import { dateCN, Empty, errorText } from "../components/media/MediaUI";

import {
  Detail,
  Discovery,
  HomeRecommendations,
} from "../pages/catalog/Discovery";

import { Calendar, TVEditor, TVList } from "../pages/tv/TVSubscriptions";

import { ResourceSearch } from "../pages/resources/ResourceSearch";

import { LiveLogin } from "../pages/auth/LiveLogin";
import { DownloadDialog, Downloads } from "../pages/downloads/Downloads";

const ServerSettings = lazy(() =>
  import("../pages/settings/ServerSettings").then((m) => ({
    default: m.ServerSettings,
  })),
);

const AnimeSubscriptions = lazy(() =>
  import("../pages/anime/AnimeSubscriptions").then((m) => ({
    default: m.AnimeSubscriptions,
  })),
);

const Organize = lazy(() =>
  import("../pages/organize/Organize").then((m) => ({ default: m.Organize })),
);

const Logs = lazy(() =>
  import("../pages/logs/Logs").then((m) => ({ default: m.Logs })),
);

const Emby = lazy(() =>
  import("../pages/emby/Emby").then((m) => ({ default: m.Emby })),
);

export type Page =
  | (typeof navigationItems)[number][0]
  | "home"
  | "subscriptions"
  | "downloads"
  | "organize";

export default function MediaApp() {
  const {
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
  } = useMediaWorkspace();
  if (!session)
    return liveLogin ? (
      <LiveLogin onLogin={login} onDemo={() => setLiveLogin(false)} />
    ) : (
      <>
        <Login
          onLogin={(remember) =>
            login({ mode: "demo", name: "MediaHub" }, remember)
          }
          onForgot={() => notify("演示账号：kate@acme.com / heroui123")}
        />
        <Button
          className="connect-service"
          variant="secondary"
          onPress={() => setLiveLogin(true)}
        >
          连接已有 MediaHub 服务
        </Button>
        {toast && (
          <div role="status" className="media-toast">
            {toast}
          </div>
        )}
      </>
    );
  const title = navigation.find((n) => n[0] === page)?.[1];
  return (
    <div className={`app-shell media-shell ${mobile ? "mobile-open" : ""}`}>
      {mobile && (
        <button
          className="sidebar-backdrop"
          aria-label="关闭导航"
          onClick={() => setMobile(false)}
        />
      )}
      <WorkspaceSidebar session={session} page={page} go={go} logout={logout} />
      <div className="media-workspace">
        <WorkspaceHeader
          session={session}
          title={title}
          go={go}
          logout={logout}
          mobile={mobile}
          setMobile={setMobile}
          dark={dark}
          setDark={setDark}
        />
        <main className="media-main">
          {detail && (
            <Detail
              media={detail}
              api={api!}
              close={() => setDetail(null)}
              search={searchFor}
              subscribe={(m, season) => {
                setDetail(null);
                setEdit({
                  tmdbId: m.sourceId,
                  title: m.title,
                  season,
                  source: "pansou",
                  enabled: true,
                  channels: [],
                  match: "",
                  exclude: "",
                });
              }}
            />
          )}

          <div hidden={!!detail}>
            <div className="media-heading">
              <div>
                <h1>{title}</h1>
                <p>
                  {
                    {
                      home: "发现下一部心头好，让每一次更新都有迹可循。",
                      emby: "查看媒体库、最新入库与继续观看。",
                      anime: "订阅番剧 RSS，管理字幕组、匹配规则与自动下载。",
                      organize: "预览文件命名和目标目录，确认后整理到媒体库。",
                      logs: "查询服务运行记录，定位同步与下载问题。",
                      discover: "从不同来源出发，找到值得花时间的作品。",
                      rankings:
                        "跟随网站榜单与平台片库，发现正在被关注的故事。",
                      search: "搜索网盘分享与磁力资源，把发现连接到收藏。",
                      subscriptions:
                        "按季追踪更新，使用你选择的 TG 或 PanSou 搜索规则。",
                      calendar: "以北京时间查看播出计划与资源进展。",
                      downloads: "查看已提交到 115 的离线下载与转存任务。",
                      settings: "管理基础配置、媒体整理、资源搜索和账号安全。",
                    }[page]
                  }
                </p>
              </div>
              {(page === "subscriptions" || page === "calendar") && (
                <Button
                  onPress={() =>
                    setEdit({
                      tmdbId: "",
                      title: "",
                      season: 1,
                      source: "pansou",
                      enabled: true,
                      channels: [],
                      match: "",
                      exclude: "",
                    })
                  }
                >
                  <Plus size={16} />
                  添加订阅
                </Button>
              )}
              {(page === "subscriptions" || page === "calendar") && (
                <Button
                  variant="secondary"
                  isDisabled={tvLoading}
                  onPress={async () => {
                    if (!api) return;
                    setTVLoading(true);
                    const version = ++tvVersion.current;
                    try {
                      const result = await api.tv();
                      if (version === tvVersion.current)
                        setSubscriptions(result);
                    } catch (e) {
                      setError(errorText(e));
                    } finally {
                      setTVLoading(false);
                    }
                  }}
                >
                  <RefreshCw size={16} />
                  刷新订阅状态
                </Button>
              )}
            </div>
            {error && (
              <div role="alert" className="media-error">
                {error}
                <Button variant="ghost" size="sm" onPress={() => setError("")}>
                  关闭
                </Button>
              </div>
            )}
            <Suspense fallback={<Empty>正在加载功能页面…</Empty>}>
              {page === "emby" && <Emby session={session} open={setDetail} />}
              {page === "anime" && (
                <AnimeSubscriptions open={setDetail} session={session} />
              )}
              {page === "organize" && <Organize session={session} />}
              {page === "logs" && <Logs session={session} />}
            </Suspense>
            {page === "home" && (
              <>
                <div className="media-stat-grid">
                  {[
                    [
                      "正在追剧",
                      subscriptions.filter((s) => s.enabled).length,
                      "部订阅持续跟踪",
                    ],
                    [
                      "今日播出",
                      subscriptions
                        .flatMap((s) => s.episodes)
                        .filter((e) => e.airDate === dateCN(new Date())).length,
                      "集故事即将更新",
                    ],
                    [
                      "已找到资源",
                      subscriptions.reduce((n, s) => n + s.resources.length, 0),
                      "条资源等待查看",
                    ],
                    ["下载任务", downloads.length, "项下载与分享转存"],
                  ].map(([label, value, note]) => (
                    <Card className="media-stat" key={label}>
                      <span>{label}</span>
                      <strong>{tvLoading ? "—" : value}</strong>
                      <small>{note}</small>
                    </Card>
                  ))}
                </div>
                <div className="media-home-grid">
                  <Card className="media-welcome">
                    <span>MAKE TIME FOR GOOD STORIES</span>
                    <h2>
                      好故事，
                      <br />
                      值得被好好收藏。
                    </h2>
                    <p>探索灵感，订阅期待，把你的影视世界收在一处。</p>
                    <Button onPress={() => go("discover")}>
                      开始探索
                      <ChevronRight size={16} />
                    </Button>
                    <div className="welcome-orbit">
                      <Film size={68} />
                    </div>
                  </Card>
                  <Card className="media-updates">
                    <div className="media-section-heading">
                      <h2>正在追的剧</h2>
                      <Button
                        variant="ghost"
                        size="sm"
                        onPress={() => go("subscriptions")}
                      >
                        查看全部
                        <ChevronRight size={14} />
                      </Button>
                    </div>
                    {subscriptions.length ? (
                      subscriptions.slice(0, 3).map((s, i) => (
                        <button
                          className="update-row"
                          key={s.id}
                          onClick={() => setEdit(s)}
                        >
                          <span className={`update-icon palette-${i}`}>
                            <Tv size={21} />
                          </span>
                          <span>
                            <strong>{s.title}</strong>
                            <small>
                              第 {s.season} 季 ·{" "}
                              {s.source === "tg" ? "TG 频道" : "PanSou"}
                            </small>
                          </span>
                          <Chip
                            size="sm"
                            variant="soft"
                            color={s.enabled ? "success" : "default"}
                          >
                            {s.enabled ? "追踪中" : "已暂停"}
                          </Chip>
                        </button>
                      ))
                    ) : (
                      <Empty>还没有订阅，从影视探索选一部剧吧。</Empty>
                    )}
                  </Card>
                </div>
                <div className="media-section-heading">
                  <h2>今日灵感</h2>
                  <Button variant="ghost" onPress={() => go("rankings")}>
                    更多榜单
                    <ChevronRight size={15} />
                  </Button>
                </div>
                <HomeRecommendations api={api!} open={setDetail} />
              </>
            )}
            {(["discover", "rankings"] as const)
              .filter((p) => p === page || catalogVisited.includes(p))
              .map((catalogPage) => (
                <div key={catalogPage} hidden={page !== catalogPage}>
                  <Discovery
                    search={(m) => searchFor(m.title, m)}
                    searchKeyword={(q) => searchFor(q, null)}
                    ranking={catalogPage === "rankings"}
                    api={api!}
                    demo={session.mode === "demo"}
                    open={setDetail}
                    subscribe={(m) =>
                      setEdit({
                        tmdbId: m.sourceId,
                        title: m.title,
                        season: 1,
                        source: "pansou",
                        enabled: true,
                        channels: [],
                        match: "",
                        exclude: "",
                      })
                    }
                  />
                </div>
              ))}
            {(page === "search" || searchVisited) && (
              <div hidden={page !== "search"}>
                <ResourceSearch
                  key={resourceQuery}
                  api={api!}
                  session={session}
                  initialQuery={resourceQuery}
                  back={searchBack ? () => go("discover") : undefined}
                  media={resourceMedia}
                  notify={notify}
                  onDownloaded={(task) => {
                    const items = [
                      task,
                      ...downloads.filter((t) => t.id !== task.id),
                    ];
                    setDownloads(items);
                    if (session.mode === "demo")
                      save("mediahub.hero.downloads", items);
                  }}
                />
              </div>
            )}
            {page === "subscriptions" &&
              (tvLoading ? (
                <Empty>正在读取订阅…</Empty>
              ) : (
                <TVList
                  items={subscriptions}
                  download={(tv, resource) => setTVDownload({ tv, resource })}
                  edit={setEdit}
                  action={tvAction}
                  add={() =>
                    setEdit({
                      tmdbId: "",
                      title: "",
                      season: 1,
                      source: "pansou",
                      enabled: true,
                      channels: [],
                      match: "",
                      exclude: "",
                    })
                  }
                />
              ))}
            {page === "calendar" && (
              <>
                <Calendar
                  items={subscriptions}
                  edit={setEdit}
                  download={(tv, resource) => setTVDownload({ tv, resource })}
                />
                <div className="media-section-heading">
                  <h2>我的追剧 · {subscriptions.length}</h2>
                </div>
                <TVList
                  items={subscriptions}
                  edit={setEdit}
                  action={tvAction}
                  download={(tv, resource) => setTVDownload({ tv, resource })}
                  add={() => go("discover")}
                />
              </>
            )}
            {page === "downloads" && (
              <Downloads
                tasks={downloads}
                session={session}
                update={setDownloads}
                notify={notify}
              />
            )}
            {page === "settings" && (
              <Suspense fallback={<Empty>正在加载设置…</Empty>}>
                <ServerSettings
                  session={session}
                  onSession={(s) => login(s, !!localStorage.getItem(SESSION))}
                />
              </Suspense>
            )}
          </div>
        </main>
        <footer className="media-footer">
          <span>MediaHub · 留一点时间给好故事</span>
          <span>
            {session.mode === "demo" ? "本地演示资料" : "数据来自已连接服务"} ·
            Asia/Shanghai
          </span>
        </footer>
      </div>
      {tvDownload && (
        <DownloadDialog
          session={session}
          url={tvDownload.resource.url}
          password={tvDownload.resource.password}
          title={tvDownload.resource.title}
          reference={{
            source: "tv_subscription",
            sourceId: tvDownload.tv.id,
            media: {
              type: "tv",
              title: tvDownload.tv.title,
              provider: "tmdb",
              providerId: tvDownload.tv.tmdbId,
              season: tvDownload.tv.season,
              episodes: tvDownload.resource.collectionEnd
                ? undefined
                : [tvDownload.resource.episode],
            },
          }}
          close={() => setTVDownload(null)}
          created={(task) => {
            const next = [task, ...downloads.filter((t) => t.id !== task.id)];
            setDownloads(next);
            if (session.mode === "demo") save("mediahub.hero.downloads", next);
            notify("任务已提交");
          }}
        />
      )}
      {edit && (
        <TVEditor value={edit} close={() => setEdit(null)} submit={saveTV} />
      )}
      {toast && (
        <div role="status" className="media-toast">
          <Check size={17} />
          {toast}
          <button aria-label="关闭提示" onClick={() => setToast("")}>
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
