import { Button,Input } from "@heroui/react";
import { ChevronLeft,Folder } from "lucide-react";
import { useEffect,useState,type ReactNode } from "react";
import { downloadApi,type DownloadFile } from "../../lib/download-api";
import type { Session } from "../../lib/media-service";
import { Empty,errorText } from "../media/MediaUI";
import { Overlay } from './Overlay';

export function Field({
  label,
  value,
  onChange,
  type = "text",
  required = false,
  placeholder,
}: {
  label: string;
  value: string | number;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <label className="management-field">
      <span>{label}</span>
      <Input
        aria-label={label}
        type={type}
        value={String(value)}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        placeholder={placeholder}
      />
    </label>
  );
}
export function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="management-toggle">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>{label}</span>
    </label>
  );
}
export function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[][];
  onChange: (v: string) => void;
}) {
  return (
    <label className="management-field">
      <span>{label}</span>
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map(([id, text]) => (
          <option key={id} value={id}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
}
export function Notice({
  error,
  children,
}: {
  error?: string;
  children?: ReactNode;
}) {
  return error ? (
    <p role="alert" className="media-error">
      {error}
    </p>
  ) : children ? (
    <p role="status" className="management-notice">
      {children}
    </p>
  ) : null;
}
export function DirectoryField({
  label,
  value,
  onChange,
  session,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  session: Session;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <div className="directory-field">
        <Field
          label={label}
          value={value}
          onChange={onChange}
          placeholder="115 文件夹链接或数字 ID"
        />
        <Button
          variant="secondary"
          onPress={() => setOpen(true)}
          isDisabled={session.mode === "demo"}
        >
          <Folder size={16} />
          浏览
        </Button>
      </div>
      {open && (
        <DirectoryPicker
          onClose={() => setOpen(false)}
          onSelect={(id) => {
            onChange(id);
            setOpen(false);
          }}
        />
      )}
    </div>
  );
}
function DirectoryPicker({
  onClose,
  onSelect,
}: {
  onClose: () => void;
  onSelect: (id: string) => void;
}) {
  const [path, setPath] = useState([{ id: "0", name: "根目录" }]);
  const [items, setItems] = useState<DownloadFile[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);
  const current = path.at(-1)!;
  useEffect(() => {
    const controller = new AbortController();
    setBusy(true);
    setError("");
    setItems([]);
    downloadApi
      .directories(current.id, controller.signal)
      .then((r) => {
        if (!controller.signal.aborted)
          setItems(r.items.filter((f) => f.directory));
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(errorText(e));
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
    return () => controller.abort();
  }, [current.id]);
  return (
    <Overlay title="选择 115 文件夹" onClose={onClose}>
      <div className="management-stack">
        <p>{path.map((p) => p.name).join(" / ")}</p>
        <Notice error={error} />
        <div className="management-actions">
          <Button
            variant="secondary"
            isDisabled={path.length === 1 || busy}
            onPress={() => setPath((p) => p.slice(0, -1))}
          >
            <ChevronLeft size={16} />
            上一级
          </Button>
          <Button
            isDisabled={current.id === "0" || busy || !!error}
            onPress={() => onSelect(current.id)}
          >
            选择当前目录
          </Button>
        </div>
        {busy ? (
          <Empty>正在读取文件夹…</Empty>
        ) : (
          items.map((f) => (
            <Button
              variant="ghost"
              key={f.id}
              onPress={() => setPath((p) => [...p, { id: f.id, name: f.name }])}
            >
              <Folder size={16} />
              {f.name}
            </Button>
          ))
        )}
        {!busy && !items.length && !error && <Empty>此目录没有子文件夹</Empty>}
      </div>
    </Overlay>
  );
}
