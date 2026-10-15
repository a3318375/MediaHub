import {
useEffect,
useState,
type FormEvent
} from "react";

import { Button,Card,Input } from "@heroui/react";






import {
request,
type Session
} from "../../lib/media-service";


import { errorText } from "../../components/media/MediaUI";





export function LiveLogin({
  onLogin,
  onDemo,
}: {
  onLogin: (s: Session, remember?: boolean) => void;
  onDemo: () => void;
}) {
  const [account, setAccount] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [setup, setSetup] = useState<boolean | null>(null);
  const [confirm, setConfirm] = useState("");
  const [remember, setRemember] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    setSetup(null);
    setError("");
    request<{ setupRequired: boolean }>("/api/auth/setup/status")
      .then((r) => {
        if (active) setSetup(r.setupRequired);
      })
      .catch((e) => {
        if (active) setError(errorText(e));
      });
    return () => {
      active = false;
    };
  }, [revision]);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (setup === null) return;
    if (setup && password !== confirm) {
      setError("两次输入的密码不一致");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const r = await request<{
        accessToken: string;
        user: { name: string; account: string };
      }>(setup ? "/api/auth/setup" : "/api/auth/login", null, "POST", {
        account,
        password,
      });
      onLogin(
        {
          mode: "live",
          name: r.user.name || r.user.account,
          token: r.accessToken,
        },
        remember,
      );
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
        <h1>{setup ? "创建管理员账号" : "连接 MediaHub"}</h1>
        <p>
          {setup
            ? "首次使用，创建你的管理员账号。"
            : "使用 MediaHub 管理员账号登录。"}
        </p>
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
          {setup && (
            <label>
              确认密码
              <Input
                aria-label="确认密码"
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
              />
            </label>
          )}
          <label className="management-toggle">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
            />
            记住登录状态
          </label>
          {setup === null && !error && (
            <p role="status">正在检查服务初始化状态…</p>
          )}
          {setup === null && error && (
            <Button
              variant="secondary"
              onPress={() => setRevision((n) => n + 1)}
            >
              重新连接
            </Button>
          )}
          {error && (
            <p role="alert" className="media-error">
              {error}
            </p>
          )}
          <Button type="submit" isDisabled={busy || setup === null}>
            {busy ? "正在处理…" : setup ? "创建账号并登录" : "连接服务"}
          </Button>
          <Button variant="secondary" onPress={onDemo}>
            返回独立演示
          </Button>
        </form>
        <small>账号与数据由已连接的 MediaHub 服务管理。</small>
      </Card>
    </div>
  );
}
