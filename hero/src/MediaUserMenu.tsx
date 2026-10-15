import { useState } from "react";
import { Button } from "@heroui/react";
import { Bell, LogOut, Settings, UserRound } from "lucide-react";
import { Overlay } from "./App";
import { request, type Session } from "./media-service";
import { errorText } from "./MediaUI";

export function MediaUserMenu({
  session,
  settings,
  logout,
}: {
  session: Session;
  settings: () => void;
  logout: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [user, setUser] = useState({
    name: session.name,
    account: session.name,
    email: "",
  });
  const [error, setError] = useState("");
  return (
    <>
      <details className="header-notifications">
        <summary aria-label="打开通知" title="通知">
          <Bell size={18} />
        </summary>
        <div>
          <strong>通知</strong>
          <p>暂无新通知</p>
        </div>
      </details>
      <button
        className="media-user"
        aria-label={`打开${session.name}的用户菜单`}
        onClick={() => {
          setOpen(true);
          setError("");
          if (session.mode === "live")
            void request<{ name: string; account: string; email?: string }>(
              "/api/auth/me",
              session,
            )
              .then((r) => setUser({ ...r, email: r.email || "" }))
              .catch((e) => setError(errorText(e)));
        }}
      >
        {session.name.slice(0, 1).toUpperCase()}
      </button>
      {open && (
        <Overlay
          title={user.name}
          onClose={() => setOpen(false)}
          footer={
            <Button
              variant="danger"
              onPress={() => {
                setOpen(false);
                logout();
              }}
            >
              <LogOut size={16} />
              退出登录
            </Button>
          }
        >
          <div className="management-stack">
            <p>{user.email || user.account}</p>
            <p>
              <UserRound size={16} />
              账号：{user.account}
            </p>
            <Button
              variant="secondary"
              onPress={() => {
                setOpen(false);
                settings();
              }}
            >
              <Settings size={16} />
              全局设置
            </Button>
            {error && (
              <p role="alert" className="media-error">
                {error}
              </p>
            )}
          </div>
        </Overlay>
      )}
    </>
  );
}
