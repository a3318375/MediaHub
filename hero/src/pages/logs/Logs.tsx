import { useEffect,useState } from "react";

import { Button,Card,Chip } from "@heroui/react";


import {
Field,
Notice,
SelectField,
Toggle
} from "../../components/ui/ManagementUI";

import { Empty,errorText,time } from "../../components/media/MediaUI";

import { getLogs,type LogEntry } from "../../lib/logs-api";



import { type Session } from "../../lib/media-service";


export function Logs({ session }: { session: Session }) {
  const [level, setLevel] = useState("");
  const [source, setSource] = useState("");
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState("200");
  const [items, setItems] = useState<LogEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [auto, setAuto] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    async function load() {
      setBusy(true);
      try {
        const r =
          session.mode === "live"
            ? await getLogs({ level, source, query, limit: Number(limit) })
            : [];
        if (active) {
          setItems(r);
          setError("");
        }
      } catch (e) {
        if (active) setError(errorText(e));
      } finally {
        if (active) {
          setBusy(false);
          if (auto) timer = setTimeout(load, 5000);
        }
      }
    }
    void load();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [session, level, source, limit, revision, auto]);
  function exportLogs() {
    const blob = new Blob(
      [
        items
          .map((i) => `${i.time}\t${i.level}\t${i.source}\t${i.message}`)
          .join("\n"),
      ],
      { type: "text/plain;charset=utf-8" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "mediahub-logs.txt";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <section className="management-stack">
      <Card className="management-card">
        <form
          className="management-grid"
          onSubmit={(e) => {
            e.preventDefault();
            setRevision((n) => n + 1);
          }}
        >
          <SelectField
            label="日志级别"
            value={level}
            options={[
              ["", "全部级别"],
              ...["INFO", "WARN", "ERROR", "DEBUG"].map((l) => [l, l]),
            ]}
            onChange={setLevel}
          />
          <Field label="模块来源" value={source} onChange={setSource} />
          <Field label="关键词" value={query} onChange={setQuery} />
          <SelectField
            label="显示条数"
            value={limit}
            options={[
              ["100", "100"],
              ["200", "200"],
              ["500", "500"],
              ["1000", "1000"],
            ]}
            onChange={setLimit}
          />
          <div className="management-actions">
            <Button type="submit" isDisabled={busy}>
              {busy ? "读取中…" : "查询日志"}
            </Button>
            <Button
              variant="secondary"
              isDisabled={!items.length}
              onPress={exportLogs}
            >
              导出日志
            </Button>
          </div>
          <Toggle label="每 5 秒刷新" checked={auto} onChange={setAuto} />
        </form>
      </Card>
      <Notice error={error} />
      {!items.length ? (
        <Empty>
          {session.mode === "demo"
            ? "演示模式没有服务端日志"
            : busy
              ? "正在读取日志…"
              : "暂无符合条件的日志"}
        </Empty>
      ) : (
        <Card className="management-card management-table-wrap">
          <table className="management-table">
            <thead>
              <tr>
                <th>时间</th>
                <th>级别</th>
                <th>来源</th>
                <th>消息</th>
              </tr>
            </thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.id}>
                  <td>{time(i.time)}</td>
                  <td>
                    <Chip
                      size="sm"
                      variant="soft"
                      color={
                        i.level === "ERROR"
                          ? "danger"
                          : i.level === "WARN"
                            ? "warning"
                            : "default"
                      }
                    >
                      {i.level}
                    </Chip>
                  </td>
                  <td>{i.source}</td>
                  <td className="log-message">{i.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </section>
  );
}
