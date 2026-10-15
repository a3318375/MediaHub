import { useEffect,useState } from "react";

import { Button,Card } from "@heroui/react";

import { request,type Session } from "../../lib/media-service";




import { Field,Notice } from "../../components/ui/ManagementUI";

import { errorText } from "../../components/media/MediaUI";



export function AccountSettings({
  session,
  onSession,
}: {
  session: Session;
  onSession: (s: Session) => void;
}) {
  const [account, setAccount] = useState("");
  const [initial, setInitial] = useState("");
  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let active = true;
    request<{ account: string }>("/api/auth/me", session)
      .then((r) => {
        if (active) {
          setAccount(r.account);
          setInitial(r.account);
          setLoaded(true);
        }
      })
      .catch((e) => {
        if (active) setError(errorText(e));
      });
    return () => {
      active = false;
    };
  }, [session]);
  async function submit() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (password !== confirm)
        throw new Error("两次输入的新密码不一致，请检查后再保存。");
      if ((account.trim() !== initial || password) && !current)
        throw new Error("请先输入当前密码验证身份");
      if (account.trim() !== initial) {
        await request("/api/auth/account", session, "PATCH", {
          account: account.trim(),
          currentPassword: current,
        });
        setInitial(account.trim());
      }
      let next = session;
      if (password) {
        const r = await request<{
          accessToken: string;
          user: { name: string };
        }>("/api/auth/password", session, "POST", {
          currentPassword: current,
          newPassword: password,
        });
        next = { ...session, token: r.accessToken, name: r.user.name };
        onSession(next);
      }
      const user = await request<{ account: string }>("/api/auth/me", next);
      setAccount(user.account);
      setInitial(user.account);
      setCurrent("");
      setPassword("");
      setConfirm("");
      setNotice("账号安全信息已保存。");
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card className="management-card">
      <h2>账号与安全</h2>
      <Notice error={error}>{notice}</Notice>
      <form
        className="management-stack"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <Field
          label="登录账号"
          value={account}
          onChange={setAccount}
          required
        />
        <Field
          label="当前密码"
          type="password"
          value={current}
          onChange={setCurrent}
        />
        <Field
          label="新密码"
          type="password"
          value={password}
          onChange={setPassword}
        />
        <Field
          label="确认新密码"
          type="password"
          value={confirm}
          onChange={setConfirm}
        />
        <Button type="submit" isDisabled={busy || !loaded}>
          {busy ? "保存中…" : "保存"}
        </Button>
      </form>
    </Card>
  );
}
