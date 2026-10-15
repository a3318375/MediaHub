import { useEffect,useRef,useState } from "react";
import { request,type Resource,type Session } from "../lib/media-service";
import { safeResourceURL } from "../lib/resource-search";

type Health = { disk_type?: string; url: string; state: string; summary?: string; expires_at?: number };
export const resourceHealthKey = (link: Resource) => JSON.stringify([link.cloud, link.url, link.password || ""]);
export function useResourceHealth(links: Resource[], enabled: boolean, session: Session, notify: (s: string) => void) {
  const [health, setHealth] = useState<Record<string, Health>>({});
  const [checking, setChecking] = useState("");
  const cache = useRef<Record<string, Health>>({});
  const serialized = JSON.stringify(links);
  useEffect(() => {
    if (!enabled || session.mode !== "live" || !window.IntersectionObserver) return;
    const current = JSON.parse(serialized) as Resource[];
    const controller = new AbortController();
    const pending = new Map<string, Resource>();
    const seen = new Set<string>();
    let timer: ReturnType<typeof setTimeout>;
    let running = false;
    async function flush() {
      if (running || controller.signal.aborted) return;
      running = true;
      try {
        while (pending.size && !controller.signal.aborted) {
          const batch = [...pending.entries()].slice(0, 6);
          batch.forEach(([key]) => pending.delete(key));
          const updates: Record<string, Health> = {};
          try {
            const { results } = await request<{ results: Health[] }>("/api/v1/resources/check", session, "POST", { items: batch.map(([, l]) => ({ disk_type: l.cloud, url: l.url, password: l.password })) }, 30_000, controller.signal);
            for (const [key, link] of batch) {
              const item = results.find(r => r.url === link.url && (!r.disk_type || r.disk_type === link.cloud));
              if (item) updates[key] = item;
            }
          } catch {
            for (const [key, link] of batch) updates[key] = { url: link.url, state: "uncertain", summary: "检测失败，可手动重试", expires_at: Date.now() + 30_000 };
          }
          if (controller.signal.aborted) return;
          Object.assign(cache.current, updates);
          setHealth(old => ({ ...old, ...updates }));
        }
      } finally { running = false; }
    }
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const link = current[Number((entry.target as HTMLElement).dataset.resourceIndex)];
        if (!link || !safeResourceURL(link.url)) continue;
        const key = resourceHealthKey(link);
        if (seen.has(key) || (cache.current[key]?.expires_at || 0) > Date.now()) continue;
        seen.add(key); pending.set(key, link);
      }
      if (pending.size && !running) { clearTimeout(timer); timer = setTimeout(() => void flush(), 220); }
    });
    document.querySelectorAll("[data-resource-index]").forEach(el => observer.observe(el));
    return () => { controller.abort(); observer.disconnect(); clearTimeout(timer); };
  }, [serialized, enabled, session]);
  async function check(link: Resource) {
    setChecking(link.url);
    try {
      const { results } = await request<{results: Health[]}>("/api/v1/resources/check", session, "POST", {items: [{disk_type: link.cloud, url: link.url, password: link.password}]});
      const item = results.find(r => r.url === link.url);
      if (item) { cache.current[resourceHealthKey(link)] = item; setHealth(old => ({...old, [resourceHealthKey(link)]: item})); }
    } catch (e) { notify(e instanceof Error ? e.message : "检测失败"); }
    finally { setChecking(""); }
  }
  return { health, checking, check };
}
