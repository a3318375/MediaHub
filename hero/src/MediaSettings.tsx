import { useEffect, useState } from "react";
import { Button, Card, Input } from "@heroui/react";
import { clearCache, read, save, request, type Session } from "./media-service";
import {
  settingsApi,
  type SettingsSection,
  type SettingValue,
} from "./lib/settings-api";
import { apiKeysApi, type APIKeyInfo } from "./lib/api-keys-api";
import {
  normalizeResourceChannel,
  type ResourceSearchMeta,
} from "./lib/resource-search";
import { Field, Toggle, SelectField, Notice } from "./ManagementUI";
import { errorText, FilterTabs, time } from "./MediaUI";

type Schema = [string, string, SettingValue, "secret"?];
const schemas: Record<SettingsSection, Schema[]> = {
  tmdb: [["tmdb.apiKey", "TMDB API Key", "", "secret"]],
  emby: [
    ["emby.url", "Emby 地址", ""],
    ["emby.apiKey", "Emby API Key", "", "secret"],
    ["emby.cacheExpirationHours", "缓存时长（小时）", 12],
  ],
  "115": [
    ["115.cookie", "115 Cookie", "", "secret"],
    ["115.downloadDirectory", "默认下载目录", ""],
  ],
  organize: [
    ["organize.enabled", "启用整理", true],
    ["organize.sourcePaths", "来源路径", ""],
    ["organize.moviePath", "电影路径", ""],
    ["organize.tvPath", "剧集路径", ""],
    [
      "organize.movieFormat",
      "电影命名格式",
      "{title} ({year})/{title} ({year})",
    ],
    [
      "organize.tvFormat",
      "剧集命名格式",
      "{title} ({year})/Season {season}/{title} - S{season}E{episode}",
    ],
    ["organize.moveMode", "移动方式", "硬链接，失败时复制"],
    ["organize.skipExisting", "跳过已有文件", true],
  ],
  search: [
    ["search.tmdb", "TMDB 元数据", true],
    ["search.douban", "豆瓣元数据", true],
    ["search.bangumi", "Bangumi 元数据", true],
    ["search.anilist", "AniList 元数据", true],
    ["search.priority", "来源优先级", "TMDB → 豆瓣 → Bangumi → AniList"],
    ["search.auto", "自动搜索订阅", true],
    ["search.interval", "搜索间隔（小时）", "24"],
    ["search.minSeeders", "最少做种数", "2"],
    ["search.quality", "画质偏好", "优先 1080p，允许 2160p"],
    ["search.excludeKeywords", "排除关键词", "预告, 花絮, 样片, 宣传片"],
  ],
  pansou: [],
  notifications: [
    ["notifications.telegramEnabled", "启用 Telegram 通知", false],
    ["notifications.botToken", "机器人 Token", "", "secret"],
    ["notifications.chatId", "Chat ID", ""],
    ["notifications.receiveEnabled", "接收机器人消息", false],
    ["notifications.receiveMode", "接收方式", "长轮询"],
    ["notifications.webhookUrl", "Webhook URL", ""],
    ["notifications.notifyOnComplete", "任务完成时通知", true],
    ["notifications.notifyOnError", "任务失败时通知", true],
  ],
};
import { settingsTabs, cloudLabels } from "./parity";
import { MediaLibrarySettings } from "./MediaLibrarySettings";
export function ServerSettings({
  session,
  onSession,
}: {
  session: Session;
  onSession: (s: Session) => void;
}) {
  const [tab, setTab] = useState("basic");
  return (
    <section className="management-stack">
      <p className="management-notice">
        {session.mode === "demo"
          ? "当前为演示模式，配置仅保存在当前浏览器。"
          : "设置保存在服务端。API Key、115 Cookie 和机器人令牌加密存储；默认显示头尾部分，点击“显示全文”查看。"}
      </p>
      <FilterTabs
        label="全局设置分类"
        value={tab}
        options={settingsTabs}
        onChange={setTab}
      />
      <div hidden={tab !== "basic"}>
        <SettingsForm
          sections={["tmdb", "emby", "115"]}
          session={session}
          basic
        />
      </div>
      <div hidden={tab !== "organize"}>
        {tab === "organize" && <MediaLibrarySettings session={session} />}
      </div>
      <div hidden={tab !== "search"}>
        <SettingsForm sections={["search"]} session={session} />
      </div>
      <div hidden={tab !== "pansou"}>
        <ResourceSettings session={session} />
      </div>
      <div hidden={tab !== "account"}>
        {session.mode === "live" ? (
          <AccountSettings session={session} onSession={onSession} />
        ) : (
          <Card className="management-card">
            <p>连接服务后管理账号与安全。</p>
          </Card>
        )}
      </div>
      <div hidden={tab !== "api-keys"}>
        {session.mode === "live" ? (
          <APIKeys />
        ) : (
          <Card className="management-card">
            <p>连接服务后管理 API 密钥。</p>
          </Card>
        )}
      </div>
      <div hidden={tab !== "notifications"}>
        <SettingsForm sections={["notifications"]} session={session} />
      </div>
    </section>
  );
}
function SecretField({
  section,
  name,
  label,
  value,
  configured,
  masked,
  onChange,
}: {
  section: SettingsSection;
  name: string;
  label: string;
  value: string;
  configured: boolean;
  masked?: string;
  onChange: (v: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [visible, setVisible] = useState(false);
  const [plain, setPlain] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const edit = editing || !configured || value !== "";
  const displayed = edit ? value : visible ? plain : masked || "已保存";
  return (
    <div className="management-stack secret-setting">
      <label className="management-field">
        <span>{label}</span>
        {name === "115.cookie" && visible ? (
          <textarea
            aria-label={label}
            rows={3}
            value={displayed}
            readOnly={!edit}
            onChange={(e) => edit && onChange(e.target.value)}
          />
        ) : (
          <Input
            aria-label={label}
            autoComplete="off"
            type={edit && !visible ? "password" : "text"}
            value={displayed}
            readOnly={!edit}
            onChange={(e) => edit && onChange(e.target.value)}
            placeholder="输入新凭证；留空保留现有值"
          />
        )}
      </label>
      <div className="management-actions">
        <Button
          size="sm"
          variant="secondary"
          isDisabled={busy || (edit && !value)}
          aria-label={`${visible ? "隐藏" : "显示全文"}${label}`}
          aria-pressed={visible}
          onPress={async () => {
            if (visible) {
              setVisible(false);
              setPlain("");
              return;
            }
            if (edit) {
              setVisible(true);
              return;
            }
            setBusy(true);
            setError("");
            try {
              setPlain((await settingsApi.reveal(section, name)).value);
              setVisible(true);
            } catch (e) {
              setError(errorText(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "读取中…" : visible ? "隐藏" : "显示全文"}
        </Button>
        {configured && (
          <Button
            size="sm"
            variant="ghost"
            onPress={() => {
              onChange("");
              setEditing(!edit);
              setVisible(false);
              setPlain("");
              setError("");
            }}
          >
            {edit ? "取消修改" : "修改"}
          </Button>
        )}
      </div>
      <small className="media-note">
        {edit && configured
          ? "输入新值以替换；取消修改或留空会保留已保存值。"
          : "默认显示前后各 4 位，点击显示全文可展开。"}
      </small>
      <Notice error={error} />
    </div>
  );
}
const sectionNames: Record<string, string> = {
  tmdb: "TMDB",
  emby: "Emby",
  "115": "115 网盘",
  search: "搜索规则",
  notifications: "通知与机器人",
};
function SettingsForm({
  sections,
  session,
  basic = false,
}: {
  sections: SettingsSection[];
  session: Session;
  basic?: boolean;
}) {
  const key = sections.join(",");
  const [values, setValues] = useState<Record<string, SettingValue>>({});
  const [secrets, setSecrets] = useState<string[]>([]);
  const [masked, setMasked] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [revision, setRevision] = useState(0);
  const [saved, setSaved] = useState(0);
  useEffect(() => {
    let active = true;
    setBusy(true);
    setError("");
    const defaults = Object.fromEntries(
      sections.flatMap((section) => schemas[section].map(([k, , v]) => [k, v])),
    );
    const load =
      session.mode === "demo"
        ? Promise.resolve(
            sections.map((section) => ({
              values: read<Record<string, SettingValue>>(
                `mediahub.hero.settings.${section}`,
                {},
              ),
              configuredSecrets: [] as string[],
              maskedSecrets: {},
            })),
          )
        : Promise.all(sections.map((section) => settingsApi.get(section)));
    load
      .then((results) => {
        if (!active) return;
        setValues({
          ...defaults,
          ...Object.assign({}, ...results.map((r) => r.values)),
        });
        setSecrets(results.flatMap((r) => r.configuredSecrets));
        setMasked(
          Object.assign({}, ...results.map((r) => r.maskedSecrets || {})),
        );
        setLoaded(true);
      })
      .catch((e) => {
        if (active) setError(errorText(e));
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [key, session, revision]);
  const update = (name: string, v: SettingValue) => {
    setValues((old) => ({ ...old, [name]: v }));
    setNotice("");
  };
  return (
    <Card className="management-card">
      <Notice error={error}>{notice}</Notice>
      {!loaded && !busy && (
        <Button onPress={() => setRevision((n) => n + 1)}>重新加载</Button>
      )}
      <form
        className="management-stack"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            for (const section of sections) {
              const sectionValues = Object.fromEntries(
                Object.entries(values).filter(([k]) =>
                  k.startsWith(section + "."),
                ),
              );
              if (session.mode === "demo")
                save(`mediahub.hero.settings.${section}`, sectionValues);
              else {
                const r = await settingsApi.save(section, sectionValues);
                setSecrets((old) => [
                  ...new Set([...old, ...r.configuredSecrets]),
                ]);
                setMasked((old) => ({ ...old, ...r.maskedSecrets }));
                setValues((old) => ({
                  ...old,
                  ...r.values,
                  ...Object.fromEntries(
                    r.configuredSecrets.map((k) => [k, ""]),
                  ),
                }));
              }
            }
            clearCache();
            setSaved((n) => n + 1);
            setNotice(
              session.mode === "demo"
                ? "演示配置已保存在当前浏览器。"
                : basic
                  ? "基础配置已保存。"
                  : "本页配置已安全保存到服务端。",
            );
          } catch (e) {
            setError(errorText(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        <fieldset disabled={busy || !loaded} className="management-stack">
          {sections.map((section) => (
            <section
              className="management-stack settings-section"
              key={section}
            >
              <h2>{sectionNames[section]}</h2>
              {schemas[section]
                .filter(([name]) => name !== "notifications.receiveMode")
                .map(([name, label, fallback, secret]) =>
                  secret ? (
                    <SecretField
                      key={`${name}-${saved}`}
                      section={section}
                      name={name}
                      label={label}
                      value={String(values[name] || "")}
                      configured={secrets.includes(name)}
                      masked={masked[name]}
                      onChange={(v) => update(name, v)}
                    />
                  ) : typeof fallback === "boolean" ? (
                    <Toggle
                      key={name}
                      label={label}
                      checked={Boolean(values[name])}
                      onChange={(v) => update(name, v)}
                    />
                  ) : (
                    <Field
                      key={name}
                      label={label}
                      type={typeof fallback === "number" ? "number" : "text"}
                      value={String(values[name] ?? fallback)}
                      onChange={(v) =>
                        update(
                          name,
                          typeof fallback === "number"
                            ? Math.max(1, Number(v) || 1)
                            : v,
                        )
                      }
                    />
                  ),
                )}
              {section === "emby" && (
                <p className="media-note">
                  缓存失效时间单位为小时，默认 12 小时。超过缓存时间才重新读取
                  Emby。
                </p>
              )}
              {section === "notifications" && (
                <SelectField
                  label="接收方式"
                  value={String(
                    values["notifications.receiveMode"] || "长轮询",
                  )}
                  options={[
                    ["长轮询", "长轮询"],
                    ["Webhook", "Webhook"],
                  ]}
                  onChange={(v) => update("notifications.receiveMode", v)}
                />
              )}
            </section>
          ))}
          <Button type="submit" isDisabled={busy || !loaded}>
            {busy ? "正在处理…" : basic ? "保存基础配置" : "保存"}
          </Button>
        </fieldset>
      </form>
    </Card>
  );
}
function ResourceSettings({ session }: { session: Session }) {
  const [meta, setMeta] = useState<ResourceSearchMeta | null>(null);
  const [values, setValues] = useState<Record<string, SettingValue>>({});
  const [tab, setTab] = useState("channels");
  const [filter, setFilter] = useState("");
  const [channel, setChannel] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    const demo: ResourceSearchMeta = {
      defaults: {
        channels: [],
        plugins: [],
        cloudTypes: [],
        customChannels: [],
        detectionEnabled: false,
      },
      selection: {
        channels: [],
        plugins: [],
        cloudTypes: [],
        customChannels: [],
        detectionEnabled: false,
      },
      channels: [],
      plugins: [],
      cloudTypes: [],
    };
    setBusy(true);
    const load =
      session.mode === "demo"
        ? Promise.resolve({ data: demo })
        : request<{ data: ResourceSearchMeta }>(
            "/api/v1/resources/meta",
            session,
          );
    load
      .then((r) => {
        if (active) {
          setMeta(r.data);
          setValues({
            "pansou.channels": r.data.selection.channels,
            "pansou.plugins": r.data.selection.plugins,
            "pansou.cloudTypes": r.data.selection.cloudTypes,
            "pansou.customChannels": r.data.selection.customChannels,
            "pansou.detectionEnabled": r.data.selection.detectionEnabled,
            "pansou.configVersion": 1,
            ...(session.mode === "demo"
              ? read<Record<string, SettingValue>>(
                  "mediahub.hero.settings.pansou",
                  {},
                )
              : {}),
          });
          setLoaded(true);
        }
      })
      .catch((e) => {
        if (active) setError(errorText(e));
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [session, revision]);
  const list = (name: string) =>
    Array.isArray(values[`pansou.${name}`])
      ? (values[`pansou.${name}`] as string[])
      : [];
  const update = (name: string, value: SettingValue) => {
    setValues((v) => ({
      ...v,
      [`pansou.${name}`]: value,
      "pansou.configVersion": 1,
    }));
    setNotice("");
  };
  const options =
    tab === "channels"
      ? [
          ...new Set([
            ...(meta?.defaults.channels || []),
            ...list("customChannels"),
          ]),
        ]
      : tab === "plugins"
        ? meta?.plugins.map((p) => p.name) || []
        : meta?.cloudTypes || [];
  return (
    <Card className="management-card">
      <Notice error={error}>{notice}</Notice>
      {!loaded && !busy && (
        <Button onPress={() => setRevision((n) => n + 1)}>重新加载</Button>
      )}
      <FilterTabs
        label="资源搜索配置"
        value={tab}
        options={[
          ["channels", `TG 频道 · ${meta?.channels.length || 0}`],
          ["plugins", `搜索插件 · ${meta?.plugins.length || 0}`],
          ["cloudTypes", `网盘类型 · ${meta?.cloudTypes.length || 0}`],
          ["detection", "检测"],
        ]}
        onChange={setTab}
      />
      <fieldset disabled={busy || !loaded} className="management-stack">
        {tab === "detection" ? (
          <>
            <Toggle
              label="自动检测当前可见链接"
              checked={Boolean(values["pansou.detectionEnabled"])}
              onChange={(v) => update("detectionEnabled", v)}
            />
            <p className="media-note">
              自动检测当前可见的网盘链接；检测状态不影响搜索结果。
            </p>
          </>
        ) : (
          <>
            <div className="management-actions">
              <span>
                已选 {list(tab).length} / {options.length}
              </span>
              {tab === "plugins" && (
                <Field
                  label="筛选搜索插件"
                  value={filter}
                  onChange={setFilter}
                />
              )}
              <Button
                size="sm"
                variant="secondary"
                onPress={() =>
                  update(
                    tab,
                    list(tab).length === options.length ? [] : options,
                  )
                }
              >
                {list(tab).length === options.length ? "取消全选" : "全选"}
              </Button>
              {tab === "plugins" && (
                <Button
                  size="sm"
                  variant="ghost"
                  onPress={() => update(tab, [])}
                >
                  清空
                </Button>
              )}
            </div>
            {tab === "channels" && (
              <>
                <div className="management-actions">
                  <Field
                    label="新增 TG 频道"
                    value={channel}
                    onChange={setChannel}
                    placeholder="频道名称、@名称或 t.me 链接"
                  />
                  <Button
                    variant="secondary"
                    onPress={() => {
                      const name = normalizeResourceChannel(channel);
                      if (!name) {
                        setError("请输入有效的 TG 频道名称或链接");
                        return;
                      }
                      if (options.includes(name)) {
                        setError("频道已存在");
                        return;
                      }
                      if (options.length >= 200) {
                        setError("最多支持 200 个 TG 频道");
                        return;
                      }
                      update("customChannels", [
                        ...list("customChannels"),
                        name,
                      ]);
                      update("channels", [...list("channels"), name]);
                      setChannel("");
                      setError("");
                    }}
                  >
                    添加频道
                  </Button>
                </div>
                {list("customChannels").map((name) => (
                  <div className="management-actions" key={name}>
                    <span>{name}</span>
                    <Button
                      aria-label={`删除自定义频道 ${name}`}
                      size="sm"
                      variant="ghost"
                      onPress={() => {
                        update(
                          "customChannels",
                          list("customChannels").filter((n) => n !== name),
                        );
                        update(
                          "channels",
                          list("channels").filter((n) => n !== name),
                        );
                      }}
                    >
                      删除
                    </Button>
                  </div>
                ))}
              </>
            )}
            <div className="settings-choices">
              {options
                .filter(
                  (name) =>
                    tab !== "plugins" ||
                    name.toLowerCase().includes(filter.toLowerCase()),
                )
                .map((name) => (
                  <button
                    type="button"
                    key={name}
                    aria-pressed={list(tab).includes(name)}
                    onClick={() =>
                      update(
                        tab,
                        list(tab).includes(name)
                          ? list(tab).filter((n) => n !== name)
                          : [...list(tab), name],
                      )
                    }
                  >
                    {tab === "cloudTypes" ? cloudLabels[name] || name : name}
                  </button>
                ))}
            </div>
          </>
        )}
        <Button
          isDisabled={busy || !loaded}
          onPress={async () => {
            setBusy(true);
            setError("");
            try {
              if (session.mode === "demo")
                save("mediahub.hero.settings.pansou", values);
              else await settingsApi.save("pansou", values);
              clearCache();
              setNotice(
                session.mode === "demo"
                  ? "演示配置已保存。"
                  : "本页配置已安全保存到服务端。",
              );
            } catch (e) {
              setError(errorText(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          保存
        </Button>
      </fieldset>
    </Card>
  );
}
function AccountSettings({
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
function APIKeys() {
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
