import { useEffect,useState } from "react";

import { Button,Card } from "@heroui/react";

import { clearCache,read,save,type Session } from "../../lib/media-service";

import {
settingsApi,
type SettingsSection,
type SettingValue,
} from "../../lib/settings-api";



import { Field,Notice,SelectField,Toggle } from "../ui/ManagementUI";

import { errorText } from "../media/MediaUI";


import { schemas,sectionNames } from '../../lib/settings-schema';
import { SecretField } from './SecretField';

export function SettingsForm({
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
