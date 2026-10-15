import { Button, Chip } from "@heroui/react";
import {
  CalendarDays,
  ChevronRight,
  Clapperboard,
  Library,
  LogOut,
  Menu,
  Moon,
  ScrollText,
  Search,
  Settings,
  Sun,
  Telescope,
  Trophy,
} from "lucide-react";
import { HeaderSearch } from "../components/navigation/HeaderSearch";
import { MediaUserMenu } from "../components/navigation/UserMenu";
import type { Session } from "../lib/media-service";
import { navigationItems } from "../lib/parity";
import type { Page } from "./MediaApp";
const navIcons = {
  emby: Library,
  search: Search,
  discover: Telescope,
  rankings: Trophy,
  anime: Clapperboard,
  calendar: CalendarDays,
  logs: ScrollText,
  settings: Settings,
};

export const navigation = navigationItems.map(
  ([id, label, section]) => [id, label, navIcons[id], section] as const,
);

type SharedProps = {
  session: Session;
  go: (page: Page) => void;
  logout: () => void;
};
export function WorkspaceSidebar({
  session,
  page,
  go,
  logout,
}: SharedProps & { page: Page }) {
  return (
    <aside className="sidebar media-sidebar">
      <div className="media-brand">
        <img src="/favicon.svg" alt="" />
        <span>
          MediaHub<small>你的私人影视空间</small>
        </span>
      </div>
      <nav>
        {navigation.map(([id, label, Icon, section], index) => (
          <div key={id}>
            {(index === 0 || navigation[index - 1][3] !== section) && (
              <div className="media-nav-label">{section}</div>
            )}
            <button
              key={id}
              aria-current={page === id ? "page" : undefined}
              className={page === id ? "active" : ""}
              onClick={() => go(id)}
            >
              <Icon size={18} />
              {label}
            </button>
          </div>
        ))}
      </nav>
      <div className="media-sidebar-bottom">
        <div className="media-mode">
          <span className="mode-dot" />
          {session.mode === "demo" ? "本地演示模式" : "服务已连接"}
          <small>
            {session.mode === "demo"
              ? "数据仅保存在当前浏览器"
              : "已连接 MediaHub 服务"}
          </small>
        </div>
        <button onClick={logout}>
          <LogOut size={17} />
          退出登录
        </button>
      </div>
    </aside>
  );
}
export function WorkspaceHeader({
  session,
  title,
  go,
  logout,
  mobile,
  setMobile,
  dark,
  setDark,
}: SharedProps & {
  title?: string;
  mobile: boolean;
  setMobile: (value: boolean) => void;
  dark: boolean;
  setDark: (value: boolean) => void;
}) {
  return (
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
        <HeaderSearch navigate={(p) => go(p as Page)} />
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
        <MediaUserMenu
          session={session}
          settings={() => go("settings")}
          logout={logout}
        />
      </div>
    </header>
  );
}
