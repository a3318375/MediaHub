import { useState } from "react";

import { Card } from "@heroui/react";

import { type Session } from "../../lib/media-service";





import { FilterTabs } from "../../components/media/MediaUI";

import { settingsTabs } from "../../lib/parity";

import { SettingsForm } from '../../components/settings/SettingsForm';
import { AccountSettings } from './AccountSettings';
import { APIKeys } from './APIKeys';
import { MediaLibrarySettings } from "./MediaLibrarySettings";
import { ResourceSettings } from './ResourceSettings';

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
