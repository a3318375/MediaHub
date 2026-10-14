import { ClapperboardIcon } from "lucide-react"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
  SidebarSeparator,
  useSidebar,
} from "@/components/ui/sidebar"
import { MediaNav } from "./media-nav"

export function MediaSidebar({
  activePath,
  onNavigate,
  ...props
}: React.ComponentProps<typeof Sidebar> & {
  activePath: string
  onNavigate: (path: string) => void
}) {
  const { isMobile, setOpenMobile } = useSidebar()

  function handleNavigate(path: string) {
    onNavigate(path)
    if (isMobile) setOpenMobile(false)
  }

  return (
    <Sidebar
      variant="sidebar"
      collapsible="icon"
      className="**:data-[slot=sidebar-inner]:bg-background"
      {...props}
    >
      <SidebarHeader className="flex min-h-16 flex-row items-center border-b border-border px-4 py-3 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-2">
        <div
          role="img"
          aria-label="FRAME 媒体中心"
          className="flex min-w-0 items-center gap-3 group-data-[collapsible=icon]:justify-center"
        >
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
            <ClapperboardIcon />
          </div>
          <div className="grid min-w-0 leading-tight group-data-[collapsible=icon]:hidden">
            <span className="truncate text-sm font-semibold tracking-tight">
              FRAME
            </span>
            <span className="truncate text-xs text-muted-foreground">
              媒体中心
            </span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent className="scrollbar-none">
        <MediaNav activePath={activePath} onNavigate={handleNavigate} />
      </SidebarContent>

      <SidebarFooter className="px-3 pb-3 group-data-[collapsible=icon]:px-2">
        <SidebarSeparator className="mx-0 w-full" />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
