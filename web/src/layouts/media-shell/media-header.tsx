import { ClapperboardIcon } from "lucide-react"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"
import type { AuthUser } from "@/lib/auth-api"
import { HeaderSearch } from "./header-search"
import { NotificationsMenu } from "./notifications-menu"
import { ProfileSheet } from "./profile-sheet"
import { ThemeToggle } from "./theme-toggle"

export function MediaHeader({
  title,
  user,
  onNavigate,
  onLogout,
}: {
  title: string
  user: AuthUser
  onNavigate: (path: string) => void
  onLogout: () => void
}) {
  return (
    <header className="sticky top-0 z-10 shrink-0 border-b border-border bg-background">
      <nav
        aria-label="顶部导航"
        className="mx-auto flex min-h-14 flex-wrap items-center justify-between gap-2 px-3 py-2 sm:px-4"
      >
        <div className="flex min-w-0 items-center gap-2">
          <div
            role="img"
            aria-label="FRAME 媒体中心"
            className="flex items-center gap-2 md:hidden"
          >
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <ClapperboardIcon />
            </span>
          </div>
          <SidebarTrigger
            className="rounded-full"
            aria-label="切换侧边栏"
            title="切换侧边栏"
          />
          <Separator
            orientation="vertical"
            className="hidden h-5 sm:block"
          />
          <h1 className="truncate text-sm font-semibold tracking-tight sm:pl-1">
            {title}
          </h1>
        </div>

        <div className="flex min-w-0 flex-1 items-center justify-end gap-1 sm:gap-2">
          <HeaderSearch onNavigate={onNavigate} />
          <ThemeToggle />
          <NotificationsMenu />
          <ProfileSheet
            user={user}
            onLogout={onLogout}
            onNavigate={onNavigate}
          />
        </div>
      </nav>
    </header>
  )
}
