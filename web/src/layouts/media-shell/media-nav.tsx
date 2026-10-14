import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { navigationSections, type NavigationLink } from "./navigation-data"

function navigateFromLink(
  event: React.MouseEvent<HTMLAnchorElement>,
  path: string,
  onNavigate: (path: string) => void
) {
  if (
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  ) {
    return
  }

  event.preventDefault()
  onNavigate(path)
}

function NavigationLinkItem({
  link,
  activePath,
  onNavigate,
}: {
  link: NavigationLink
  activePath: string
  onNavigate: (path: string) => void
}) {
  const LinkIcon = link.icon

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        size="lg"
        isActive={activePath === link.path}
        tooltip={link.title}
        className="h-11 rounded-lg px-3 text-[15px] font-medium transition-colors data-active:font-semibold [&_svg]:size-[18px]"
        render={
          <a
            href={link.path}
            onClick={(event) => navigateFromLink(event, link.path, onNavigate)}
          />
        }
      >
        <LinkIcon />
        <span>{link.title}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}

export function MediaNav({
  activePath,
  onNavigate,
}: {
  activePath: string
  onNavigate: (path: string) => void
}) {
  return (
    <div className="flex flex-col gap-3 px-2.5 py-4 group-data-[collapsible=icon]:px-2">
      {navigationSections.map((section) => (
        <SidebarGroup key={section.title} className="p-0">
          <SidebarGroupLabel className="mb-1 h-9 px-3 text-xs font-semibold tracking-wide text-muted-foreground">
            {section.title}
          </SidebarGroupLabel>
          <SidebarMenu className="gap-1">
            {section.links?.map((link) => (
              <NavigationLinkItem
                key={link.path}
                link={link}
                activePath={activePath}
                onNavigate={onNavigate}
              />
            ))}
          </SidebarMenu>
        </SidebarGroup>
      ))}
    </div>
  )
}
