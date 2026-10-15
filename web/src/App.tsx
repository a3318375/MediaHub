import { useCallback, useEffect, useRef, useState } from "react"
import { LoginPage } from "@/components/login-page"
import { EmbyDashboard } from "@/components/emby-dashboard"
import { DiscoverExplorePage } from "@/components/discover-explore-page"
import { RankingsPage } from "@/components/rankings-page"
import { AnimeSubscriptionsPage } from "@/components/anime-subscriptions-page"
import { TVCalendarPage } from "@/components/tv-calendar-page"
import { LogsPage } from "@/components/logs-page"
import { MediaDetailPage } from "@/components/media-detail-page"
import {
  MediaDetailContext,
  type MediaDetailRecord,
} from "@/components/media-detail-context"
import { SettingsPage } from "@/components/settings-page"
import { ResourceSearchPage } from "@/components/resource-search-page"
import { MediaShell } from "@/layouts/media-shell/media-shell"
import { getCurrentUser, logout as logoutFromApi } from "@/lib/auth-api"
import { prepareResourceSearch } from "@/lib/resource-search"
import {
  mediaContextFromRecord,
  type DownloadMediaContext,
} from "@/lib/download-api"
import type { AuthUser } from "@/lib/auth-api"

const menuTitles: Record<string, string> = {
  "/emby": "Emby 看板",
  "/search": "搜索历史",
  "/discover/explore": "影视探索",
  "/discover/rankings": "榜单推荐",
  "/discover/anime": "动漫订阅",
  "/discover/calendar": "追剧日历",
  "/tools/organize": "影视整理",
  "/tools/downloads": "下载任务",
  "/tools/logs": "日志中心",
  "/settings": "全局设置",
}

export function App() {
  const loginRoute = window.location.pathname.replace(/\/$/, "") === "/login"
  const [user, setUser] = useState<AuthUser | null>(null)
  const [selectedMedia, setSelectedMedia] = useState<MediaDetailRecord | null>(
    null
  )
  const [activePath, setActivePath] = useState(
    menuTitles[window.location.pathname] ? window.location.pathname : "/emby"
  )
  const [resourceSearchRequest, setResourceSearchRequest] = useState<{
    id: number
    keyword: string
    media?: DownloadMediaContext
  } | null>(null)
  const [searchReturnToExplore, setSearchReturnToExplore] = useState(false)
  const resourceSearchRequestId = useRef(0)
  const [isCheckingSession, setIsCheckingSession] = useState(!loginRoute)

  const acknowledgeResourceSearchRequest = useCallback((id: number) => {
    setResourceSearchRequest((current) => (current?.id === id ? null : current))
  }, [])

  useEffect(() => {
    if (
      window.location.pathname === "/search" &&
      new URLSearchParams(window.location.search).has("kw")
    ) {
      window.history.replaceState(null, "", "/search")
    }
  }, [activePath])

  useEffect(() => {
    function syncActivePath() {
      setActivePath(
        menuTitles[window.location.pathname]
          ? window.location.pathname
          : "/emby"
      )
    }

    window.addEventListener("popstate", syncActivePath)
    return () => window.removeEventListener("popstate", syncActivePath)
  }, [])

  useEffect(() => {
    if (loginRoute) {
      return
    }

    let isCurrent = true
    getCurrentUser()
      .then((currentUser) => {
        if (isCurrent) setUser(currentUser)
      })
      .catch(() => {
        if (isCurrent) setUser(null)
      })
      .finally(() => {
        if (isCurrent) setIsCheckingSession(false)
      })

    return () => {
      isCurrent = false
    }
  }, [loginRoute])

  function handleLogin(currentUser: AuthUser) {
    setUser(currentUser)
    if (loginRoute) {
      const defaultPath = "/emby"
      window.history.replaceState(null, "", defaultPath)
      setActivePath(defaultPath)
    }
  }

  function handleNavigate(path: string) {
    window.history.pushState(null, "", path)
    setActivePath(path)
    setSearchReturnToExplore(false)
  }

  function handleResourceSearch(
    keyword: string,
    fromExplore = false,
    media?: DownloadMediaContext
  ) {
    prepareResourceSearch(sessionStorage)
    resourceSearchRequestId.current += 1
    setResourceSearchRequest({
      id: resourceSearchRequestId.current,
      keyword,
      media,
    })
    setSelectedMedia(null)
    handleNavigate("/search")
    setSearchReturnToExplore(fromExplore)
  }

  async function handleLogout() {
    try {
      await logoutFromApi()
    } catch {
      // Clear the local mock session even if the mocked endpoint fails.
    }
    setUser(null)
    window.history.replaceState(null, "", "/login")
  }

  if (loginRoute || !user) {
    if (isCheckingSession) {
      return (
        <div className="flex min-h-svh items-center justify-center text-sm text-muted-foreground">
          正在恢复登录状态…
        </div>
      )
    }

    return <LoginPage onLogin={handleLogin} />
  }

  return (
    <MediaDetailContext.Provider value={setSelectedMedia}>
      <MediaShell
        user={user}
        activePath={activePath}
        title={
          selectedMedia ? "作品详情" : (menuTitles[activePath] ?? "Emby 看板")
        }
        onNavigate={(path) => {
          setSelectedMedia(null)
          handleNavigate(path)
        }}
        onLogout={() => void handleLogout()}
      >
        {selectedMedia ? (
          <MediaDetailPage
            media={selectedMedia}
            onBack={() => setSelectedMedia(null)}
            onResourceSearch={(keyword) =>
              handleResourceSearch(
                keyword,
                false,
                mediaContextFromRecord(selectedMedia)
              )
            }
          />
        ) : activePath === "/emby" ? (
          <EmbyDashboard />
        ) : activePath === "/discover/explore" ? (
          <DiscoverExplorePage
            onResourceSearch={(keyword, media) =>
              handleResourceSearch(keyword, true, media)
            }
          />
        ) : activePath === "/discover/rankings" ? (
          <RankingsPage
            onResourceSearch={(keyword) => handleResourceSearch(keyword)}
          />
        ) : activePath === "/discover/anime" ? (
          <AnimeSubscriptionsPage />
        ) : activePath === "/discover/calendar" ? (
          <TVCalendarPage />
        ) : activePath === "/tools/logs" ? (
          <LogsPage />
        ) : activePath === "/tools/downloads" ? (
          <SettingsPage />
        ) : activePath === "/tools/organize" ? (
          <SettingsPage />
        ) : activePath === "/settings" ? (
          <SettingsPage />
        ) : activePath === "/search" ? null : (
          <div className="flex flex-1 flex-col p-6 sm:p-8">
            <section className="flex flex-col gap-2">
              <h2 className="text-2xl font-semibold tracking-tight">
                {menuTitles[activePath] ?? "Emby 看板"}
              </h2>
              <p className="text-sm text-muted-foreground">
                菜单结构预览。确认栏目后，再逐项完善对应模块。
              </p>
            </section>
          </div>
        )}
        <div
          className={
            activePath === "/search" && !selectedMedia ? "contents" : "hidden"
          }
          aria-hidden={activePath !== "/search" || Boolean(selectedMedia)}
        >
          <ResourceSearchPage
            searchRequest={resourceSearchRequest}
            onSearchRequestHandled={acknowledgeResourceSearchRequest}
            showExploreBack={searchReturnToExplore}
            onBackToExplore={() => handleNavigate("/discover/explore")}
          />
        </div>
      </MediaShell>
    </MediaDetailContext.Provider>
  )
}

export default App
