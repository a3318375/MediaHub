import type { ReactNode } from "react"
import { TooltipProvider } from "@/components/ui/tooltip"
import {
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar"
import type { AuthUser } from "@/lib/auth-api"
import { MediaHeader } from "./media-header"
import { MediaSidebar } from "./media-sidebar"

export function MediaShell({
  user,
  activePath,
  title,
  onNavigate,
  onLogout,
  children,
}: {
  user: AuthUser
  activePath: string
  title: string
  onNavigate: (path: string) => void
  onLogout: () => void
  children: ReactNode
}) {
  return (
    <TooltipProvider delay={0}>
      <SidebarProvider
        defaultOpen
        style={{ "--sidebar-width": "14rem", "--sidebar-width-icon": "52px" } as React.CSSProperties}
      >
        <MediaSidebar
          activePath={activePath}
          onNavigate={onNavigate}
        />
        <SidebarInset className="min-h-svh overflow-hidden rounded-none! shadow-none">
          <MediaHeader
            title={title}
            user={user}
            onNavigate={onNavigate}
            onLogout={onLogout}
          />
          <div className="flex flex-1 flex-col">
            <div className="mx-auto flex w-full max-w-screen-2xl flex-1 flex-col">
              <div className="flex-1">{children}</div>
              <footer className="px-4 pb-4 pt-2 text-xs text-muted-foreground">
                <a
                  href="https://shadcndashboard.dev"
                  target="_blank"
                  rel="noreferrer"
                  className="underline-offset-4 hover:text-foreground hover:underline"
                >
                  UI 框架基于 Shadcn Dashboard Free
                </a>
              </footer>
            </div>
          </div>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  )
}
