import { useEffect,useState } from "react";

import { Button,Card } from "@heroui/react";

import { apiKeysApi,type APIKeyInfo } from "../../lib/api-keys-api";

import { Field,Notice } from "../../components/ui/ManagementUI";

import { errorText,time } from "../../components/media/MediaUI";

export function APIKeys() {
  const [items, setItems] = useState<APIKeyInfo[]>([]);
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const load = () => apiKeysApi.list().then(setItems);
  useEffect(() => {
    let active = true;
    apiKeysApi
      .list()
      .then((r) => {
        if (active) setItems(r);
      })
      .catch((e) => {
        if (active) setError(errorText(e));
      });
    return () => {
      active = false;
    };
  }, []);
  async function act(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
      await load();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card className="management-card">
      <h2>API 密钥</h2>
      <Notice error={error} />
      <form
        className="media-query"
        onSubmit={(e) => {
          e.preventDefault();
          void act(async () => {
            const r = await apiKeysApi.create(name);
            setKey(r.key);
            setName("");
          });
        }}
      >
        <Field label="密钥名称" value={name} onChange={setName} required />
        <Button type="submit" isDisabled={busy}>
          创建密钥
        </Button>
      </form>
      {key && (
        <div className="management-stack">
          <p>完整密钥仅显示一次，请保存。</p>
          <code className="secret-value">{key}</code>
          <Button
            variant="secondary"
            onPress={() => {
              void navigator.clipboard
                .writeText(key)
                .catch(() => setError("复制失败，请手动复制"));
            }}
          >
            复制密钥
          </Button>
          <Button variant="ghost" onPress={() => setKey("")}>
            已保存，隐藏密钥
          </Button>
        </div>
      )}
      {items.map((k) => (
        <div key={k.id} className="management-row">
          <div>
            <strong>{k.name}</strong>
            <small>
              {k.prefix}… · 创建 {time(k.createdAt)} · 最近使用{" "}
              {k.lastUsedAt ? time(k.lastUsedAt) : "未使用"}
            </small>
          </div>
          <Button
            variant="secondary"
            isDisabled={busy || !!k.revokedAt}
            onPress={() =>
              void act(async () => {
                await apiKeysApi.revoke(k.id);
              })
            }
          >
            {k.revokedAt ? "已撤销" : "撤销密钥"}
          </Button>
        </div>
      ))}
    </Card>
  );
}
