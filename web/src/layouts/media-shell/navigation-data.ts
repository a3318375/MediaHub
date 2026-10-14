import {
  CalendarDaysIcon,
  CompassIcon,
  LayoutDashboardIcon,
  SearchIcon,
  ScrollTextIcon,
  SlidersHorizontalIcon,
  TrophyIcon,
  TvMinimalPlayIcon,
} from "lucide-react"

export type NavigationLink = {
  title: string
  path: string
  icon: typeof LayoutDashboardIcon
}

export type NavigationSection = {
  title: string
  links?: NavigationLink[]
}

export const navigationSections: NavigationSection[] = [
  {
    title: "首页",
    links: [
      { title: "Emby 看板", path: "/emby", icon: LayoutDashboardIcon },
      { title: "搜索历史", path: "/search", icon: SearchIcon },
    ],
  },
  {
    title: "功能模块",
    links: [
      { title: "影视探索", path: "/discover/explore", icon: CompassIcon },
      { title: "榜单推荐", path: "/discover/rankings", icon: TrophyIcon },
      { title: "动漫订阅", path: "/discover/anime", icon: TvMinimalPlayIcon },
      { title: "追剧日历", path: "/discover/calendar", icon: CalendarDaysIcon },
      { title: "日志中心", path: "/tools/logs", icon: ScrollTextIcon },
    ],
  },
  {
    title: "管理",
    links: [
      { title: "全局设置", path: "/settings", icon: SlidersHorizontalIcon },
    ],
  },
]

export const searchableNavigation = [
  ...navigationSections.flatMap((section) => [
    ...(section.links?.map((link) => ({ ...link, section: section.title })) ??
      []),
  ]),
]
