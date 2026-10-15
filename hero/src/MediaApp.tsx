import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Button, Card, Chip, Input } from "@heroui/react";
import {
  CalendarDays,
  Check,
  ChevronRight,
  Download as DownloadIcon,
  Film,
  House,
  LogOut,
  Menu,
  Moon,
  Plus,
  Search,
  Settings,
  Sun,
  Telescope,
  Trophy,
  Tv,
  X,
} from "lucide-react";
import { Login } from "./App";
import {
  ApiError,
  SESSION,
  clearCache,
  read,
  readSession,
  request,
  save,
  service,
  type Download,
  type Session,
  type TV,
  type TVDraft,
} from "./media-service";
import type { MediaSummary } from "./media-contract";
import { errorText, dateCN, Empty, FilterTabs } from "./MediaUI";
import { HomeRecommendations, Discovery, Detail } from "./MediaCatalog";
import { TVEditor, TVList, Calendar } from "./MediaTV";
import { ResourceSearch, DownloadList } from "./MediaResources";
const navigation = [
  ["home", "总览", House],
  ["discover", "影视探索", Telescope],
  ["rankings", "榜单推荐", Trophy],
  ["search", "资源搜索", Search],
  ["subscriptions", "电视剧订阅", Tv],
  ["calendar", "追剧日历", CalendarDays],
  ["downloads", "下载记录", DownloadIcon],
  ["settings", "设置", Settings],
] as const;
type Page = (typeof navigation)[number][0];
function LiveLogin({
  onLogin,
  onDemo,
}: {
  onLogin: (s: Session) => void;
  onDemo: () => void;
}) {
  const [account, setAccount] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await request<{
        accessToken: string;
        user: { name: string; account: string };
      }>("/api/auth/login", null, "POST", { account, password });
      onLogin({
        mode: "live",
        name: r.user.name || r.user.account,
        token: r.accessToken,
      });
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="service-login">
      <Card className="service-login-card">
        <img src="/favicon.svg" alt="" width="38" />
        <h1>连接 MediaHub</h1>
        <p>使用现有 Go 服务中的管理员账号登录。</p>
        <form onSubmit={submit}>
          <label>
            账号
            <Input
              aria-label="账号"
              value={account}
              onChange={(e) => setAccount(e.target.value)}
              autoComplete="username"
              required
            />
          </label>
          <label>
            密码
            <Input
              aria-label="密码"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </label>
          {error && (
            <p role="alert" className="media-error">
              {error}
            </p>
          )}
          <Button type="submit" isDisabled={busy}>
            {busy ? "正在登录…" : "连接服务"}
          </Button>
          <Button variant="secondary" onPress={onDemo}>
            返回独立演示
          </Button>
        </form>
        <small>首次部署请先在原前端创建管理员账号。</small>
      </Card>
    </div>
  );
}

export default function MediaApp() {
  const [session, setSession] = useState<Session | null>(readSession);
  const [liveLogin, setLiveLogin] = useState(false);
  const [page, setPage] = useState<Page>(() => {
    const hash = window.location.hash.slice(2);
    return navigation.some((n) => n[0] === hash) ? (hash as Page) : "home";
  });
  const [mobile, setMobile] = useState(false);
  const [dark, setDark] = useState(() => read("mediahub.hero.dark", false));
  const [toast, setToast] = useState("");
  const [error, setError] = useState("");
  const [subscriptions, setSubscriptions] = useState<TV[]>([]);
  const [tvLoading, setTVLoading] = useState(false);
  const [downloads, setDownloads] = useState<Download[]>([]);
  const [detail, setDetail] = useState<MediaSummary | null>(null);
  const [edit, setEdit] = useState<TV | TVDraft | null>(null);
  const [resourceQuery, setResourceQuery] = useState("");
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
      if (navigation.some((n) => n[0] === hash)) setPage(hash as Page);
    };
    window.addEventListener("hashchange", change);
    return () => window.removeEventListener("hashchange", change);
  }, []);
  useEffect(() => {
    if (!api) return;
    let active = true;
    setTVLoading(true);
    setError("");
    Promise.all([api.tv(), api.downloads()])
      .then(([tv, tasks]) => {
        if (active) {
          setSubscriptions(tv);
          setDownloads(tasks);
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
    localStorage.removeItem(SESSION);
    sessionStorage.removeItem(SESSION);
    clearCache();
    setSession(null);
    setDetail(null);
    setEdit(null);
    setSubscriptions([]);
    setDownloads([]);
    setMobile(false);
  }
  function go(p: Page) {
    window.location.hash = `/${p}`;
    setPage(p);
    setMobile(false);
    setError("");
    window.scrollTo(0, 0);
  }
  function searchFor(title: string) {
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
      <aside className="sidebar media-sidebar">
        <div className="media-brand">
          <img src="/favicon.svg" alt="" />
          <span>
            MediaHub<small>你的私人影视空间</small>
          </span>
        </div>
        <div className="media-nav-label">工作空间</div>
        <nav>
          {navigation.map(([id, label, Icon]) => (
            <button
              key={id}
              className={page === id ? "active" : ""}
              onClick={() => go(id)}
            >
              <Icon size={18} />
              {label}
              {id === "subscriptions" && <span>{subscriptions.length}</span>}
            </button>
          ))}
        </nav>
        <div className="media-sidebar-bottom">
          <div className="media-mode">
            <span className="mode-dot" />
            {session.mode === "demo" ? "本地演示模式" : "服务已连接"}
            <small>
              {session.mode === "demo"
                ? "数据仅保存在当前浏览器"
                : "沿用现有 Go 后端"}
            </small>
          </div>
          <button onClick={logout}>
            <LogOut size={17} />
            退出登录
          </button>
        </div>
      </aside>
      <div className="media-workspace">
        <header className="media-topbar">
          <div>
            <Button
              variant="ghost"
              isIconOnly
              aria-label="展开导航"
              className="media-mobile-toggle"
              onPress={() => setMobile(!mobile)}
            >
              <Menu size={19} />
            </Button>
            <span className="media-breadcrumb">工作空间</span>
            <ChevronRight size={14} />
            <strong>{title}</strong>
          </div>
          <div>
            <Chip size="sm" variant="soft">
              {session.mode === "demo" ? "DEMO" : "LIVE"}
            </Chip>
            <Button
              variant="ghost"
              isIconOnly
              aria-label={dark ? "切换浅色" : "切换深色"}
              onPress={() => setDark(!dark)}
            >
              {dark ? <Sun size={18} /> : <Moon size={18} />}
            </Button>
            <span className="media-user">
              {session.name.slice(0, 1).toUpperCase()}
            </span>
          </div>
        </header>
        <main className="media-main">
          <div className="media-heading">
            <div>
              <span className="media-eyebrow">
                YOUR MEDIA, BEAUTIFULLY ORGANIZED
              </span>
              <h1>{title}</h1>
              <p>
                {
                  {
                    home: "发现下一部心头好，让每一次更新都有迹可循。",
                    discover: "从不同来源出发，找到值得花时间的作品。",
                    rankings: "跟随网站榜单与平台片库，发现正在被关注的故事。",
                    search: "搜索网盘分享与磁力资源，把发现连接到收藏。",
                    subscriptions:
                      "按季追踪更新，使用你选择的 TG 或 PanSou 搜索规则。",
                    calendar: "以北京时间查看播出计划与资源进展。",
                    downloads: "查看已提交到 115 的离线下载与转存任务。",
                    settings: "管理当前前端的外观、运行方式与本地数据。",
                  }[page]
                }
              </p>
            </div>
            {page === "subscriptions" && (
              <Button
                onPress={() =>
                  setEdit({
                    tmdbId: "",
                    title: "",
                    season: 1,
                    source: "tg",
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
          </div>
          {error && (
            <div role="alert" className="media-error">
              {error}
              <Button variant="ghost" size="sm" onPress={() => setError("")}>
                关闭
              </Button>
            </div>
          )}
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
          {(page === "discover" || page === "rankings") && (
            <Discovery
              key={page}
              ranking={page === "rankings"}
              api={api!}
              demo={session.mode === "demo"}
              open={setDetail}
            />
          )}
          {page === "search" && (
            <ResourceSearch
              key={resourceQuery}
              api={api!}
              session={session}
              initialQuery={resourceQuery}
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
          )}
          {page === "subscriptions" &&
            (tvLoading ? (
              <Empty>正在读取订阅…</Empty>
            ) : (
              <TVList
                items={subscriptions}
                edit={setEdit}
                action={tvAction}
                add={() =>
                  setEdit({
                    tmdbId: "",
                    title: "",
                    season: 1,
                    source: "tg",
                    enabled: true,
                    channels: [],
                    match: "",
                    exclude: "",
                  })
                }
              />
            ))}
          {page === "calendar" && (
            <Calendar items={subscriptions} edit={setEdit} />
          )}
          {page === "downloads" && (
            <DownloadList
              tasks={downloads}
              session={session}
              update={setDownloads}
              notify={notify}
            />
          )}
          {page === "settings" && (
            <Card className="media-settings">
              <h2>运行环境</h2>
              <p>
                {session.mode === "demo"
                  ? "独立演示：影视资料与资源为示例，不会向服务端发送业务请求。订阅和演示下载记录保存在当前浏览器。"
                  : "服务模式：已连接当前站点 /api，订阅、搜索与下载操作使用真实服务。"}
              </p>
              <Button
                variant="secondary"
                onPress={() => {
                  logout();
                  setLiveLogin(session.mode === "demo");
                }}
              >
                {session.mode === "demo" ? "切换到服务登录" : "返回独立演示"}
              </Button>
              <hr />
              <h2>外观</h2>
              <FilterTabs
                label="主题"
                value={dark ? "dark" : "light"}
                options={[
                  ["light", "浅色"],
                  ["dark", "深色"],
                ]}
                onChange={(v) => setDark(v === "dark")}
              />
              <hr />
              <h2>浏览缓存</h2>
              <p>
                榜单、探索和详情缓存 5 分钟，平台目录缓存 24 小时；最多保留 80
                项，退出登录时清空。订阅和下载状态直接读取服务。
              </p>
              <Button
                variant="secondary"
                onPress={() => {
                  clearCache();
                  notify("浏览缓存已清空");
                }}
              >
                清空缓存
              </Button>
              <hr />
              <h2>界面参考</h2>
              <p>原始 HeroUI Dashboard 原型保留用于对照。</p>
              <a href="/?template=dashboard">查看原型</a>
            </Card>
          )}
        </main>
        <footer className="media-footer">
          <span>MediaHub · 留一点时间给好故事</span>
          <span>
            {session.mode === "demo" ? "本地演示资料" : "数据来自已连接服务"} ·
            Asia/Shanghai
          </span>
        </footer>
      </div>
      {detail && (
        <Detail
          media={detail}
          api={api!}
          close={() => setDetail(null)}
          search={searchFor}
          subscribe={(m) => {
            setDetail(null);
            setEdit({
              tmdbId: m.sourceId,
              title: m.title,
              season: 1,
              source: "tg",
              enabled: true,
              channels: [],
              match: "",
              exclude: "",
            });
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
