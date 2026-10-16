import { useState } from "react";

import { Button, Card } from "@heroui/react";

import { ChevronLeft, ChevronRight } from "lucide-react";

import { is115ShareURL } from "../../lib/download-api";

import { Overlay } from "../../components/ui/Overlay";

import { safeURL, type TV } from "../../lib/media-service";

import { dateCN, Empty } from "../../components/media/MediaUI";

export function Calendar({
  items,
  edit,
  download,
}: {
  items: TV[];
  edit: (s: TV) => void;
  download: (tv: TV, resource: TV["resources"][number]) => void;
}) {
  const [selectedEvent, setSelectedEvent] = useState<{
    subscription: TV;
    season?: number;
    number: number;
    name: string;
    airDate: string;
  } | null>(null);
  const [month, setMonth] = useState(
    () => new Date(`${dateCN(new Date()).slice(0, 7)}-01T12:00:00+08:00`),
  );
  const year = Number(dateCN(month).slice(0, 4)),
    mon = Number(dateCN(month).slice(5, 7)) - 1;
  const first = new Date(Date.UTC(year, mon, 1)).getUTCDay();
  const count = new Date(Date.UTC(year, mon + 1, 0)).getUTCDate();
  const events = items.flatMap((s) =>
    s.episodes.map((e) => ({ ...e, subscription: s })),
  );
  function shift(offset: number) {
    setMonth(new Date(Date.UTC(year, mon + offset, 1, 4)));
  }
  return (
    <Card className="media-calendar">
      <div className="media-section-heading">
        <h2>
          {year} 年 {mon + 1} 月
        </h2>
        <div>
          <Button
            variant="ghost"
            isIconOnly
            aria-label="上个月"
            onPress={() => shift(-1)}
          >
            <ChevronLeft size={18} />
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onPress={() =>
              setMonth(
                new Date(`${dateCN(new Date()).slice(0, 7)}-01T12:00:00+08:00`),
              )
            }
          >
            本月
          </Button>
          <Button
            variant="ghost"
            isIconOnly
            aria-label="下个月"
            onPress={() => shift(1)}
          >
            <ChevronRight size={18} />
          </Button>
        </div>
      </div>
      <div className="calendar-scroll">
        <div className="calendar-grid">
          {["一", "二", "三", "四", "五", "六", "日"].map((d) => (
            <div className="calendar-weekday" key={d}>
              周{d}
            </div>
          ))}
          {Array.from({ length: (first + 6) % 7 }, (_, i) => (
            <div className="calendar-day outside" key={`empty-${i}`} />
          ))}
          {Array.from({ length: count }, (_, i) => {
            const date = `${year}-${String(mon + 1).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`;
            return (
              <div
                className={`calendar-day ${date === dateCN(new Date()) ? "today" : ""}`}
                key={date}
              >
                <span>{i + 1}</span>
                {events
                  .filter((e) => e.airDate === date)
                  .map((e) => (
                    <button
                      key={`${e.subscription.id}-${e.season}-${e.number}`}
                      className={
                        e.subscription.resources.some(
                          (r) =>
                            (r.season || e.subscription.season || 1) === (e.season || e.subscription.season || 1) && (r.episode === e.number ||
                            !!(
                              r.collectionEnd &&
                              r.collectionEnd >= e.number
                            )),
                        )
                          ? "found"
                          : ""
                      }
                      onClick={() => setSelectedEvent(e)}
                    >
                      <strong>{e.subscription.title}</strong>
                      <small>
                        S{String(e.season || e.subscription.season || 1).padStart(2,"0")}E{String(e.number).padStart(2, "0")} ·{" "}
                        {e.subscription.resources.some(
                          (r) =>
                            (r.season || e.subscription.season || 1) === (e.season || e.subscription.season || 1) && (r.episode === e.number || !!(r.collectionEnd && r.collectionEnd >= e.number)),
                        )
                          ? "资源已找到"
                          : e.subscription.enabled
                            ? date > dateCN(new Date())
                              ? "待播出"
                              : "待搜资源"
                            : "订阅暂停"}
                      </small>
                    </button>
                  ))}
              </div>
            );
          })}
        </div>
      </div>
      {selectedEvent && (
        <Overlay
          title={`${selectedEvent.subscription.title} · S${String(selectedEvent.season || selectedEvent.subscription.season || 1).padStart(2,"0")}E${String(selectedEvent.number).padStart(2,"0")}`}
          onClose={() => setSelectedEvent(null)}
        >
          <div className="management-stack">
            <p>
              {selectedEvent.name} · {selectedEvent.airDate}
            </p>
            <Button
              variant="secondary"
              onPress={() => {
                edit(selectedEvent.subscription);
                setSelectedEvent(null);
              }}
            >
              编辑订阅规则
            </Button>
            {selectedEvent.subscription.resources
              .filter(
                (r) =>
                  (r.season || selectedEvent.subscription.season || 1) === (selectedEvent.season || selectedEvent.subscription.season || 1) && (r.episode === selectedEvent.number ||
                  (r.collectionEnd &&
                    r.collectionEnd >= selectedEvent.number)),
              )
              .map((r, i) => (
                <div className="management-stack" key={i}>
                  <a href={safeURL(r.url)} target="_blank" rel="noreferrer">
                    {r.title}
                  </a>
                  {(r.url.startsWith("magnet:") || is115ShareURL(r.url)) && (
                    <Button
                      onPress={() => {
                        download(selectedEvent.subscription, r);
                        setSelectedEvent(null);
                      }}
                    >
                      下载 / 转存
                    </Button>
                  )}
                </div>
              ))}
            {!selectedEvent.subscription.resources.some(
              (r) =>
                (r.season || selectedEvent.subscription.season || 1) === (selectedEvent.season || selectedEvent.subscription.season || 1) && (r.episode === selectedEvent.number || !!(r.collectionEnd && r.collectionEnd >= selectedEvent.number)),
            ) && <Empty>尚未找到本集资源，可在订阅页检查更新。</Empty>}
          </div>
        </Overlay>
      )}
      <p className="media-note">
        播出日期按北京时间展示。新建订阅的播出资料由服务端读取；演示模式不会生成真实播出计划。
      </p>
    </Card>
  );
}
