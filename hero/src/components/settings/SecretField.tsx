import { useState } from "react";

import { Button,Input } from "@heroui/react";


import {
settingsApi,
type SettingsSection
} from "../../lib/settings-api";



import { Notice } from "../ui/ManagementUI";

import { errorText } from "../media/MediaUI";



export function SecretField({
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
