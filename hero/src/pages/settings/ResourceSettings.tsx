import { useEffect,useState } from "react";

import { Button,Card } from "@heroui/react";

import {
clearCache,
read,
request,
save,
type Session,
} from "../../lib/media-service";

import { settingsApi,type SettingValue } from "../../lib/settings-api";

import {
normalizeResourceChannel,
type ResourceSearchMeta,
} from "../../lib/resource-search";

import { Field,Notice,Toggle } from "../../components/ui/ManagementUI";

import { errorText,FilterTabs } from "../../components/media/MediaUI";

import { cloudLabels } from "../../lib/parity";

export function ResourceSettings({ session }: { session: Session }) {
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
