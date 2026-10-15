import { downloadApi,is115ShareURL,type DownloadMediaContext } from "./download-api";
import type { Resource,Resources } from "./media-service";

/** Preserve older results while newly collected metadata wins for duplicate links. */
export function mergeResourceResults(current: Resources, incoming: Resources): Resources {
  const linksByCloud: Resources["linksByCloud"] = {};
  for (const cloud of new Set([...Object.keys(current.linksByCloud), ...Object.keys(incoming.linksByCloud)])) {
    const links = new Map<string, Resource>();
    for (const link of [...(current.linksByCloud[cloud] || []), ...(incoming.linksByCloud[cloud] || [])]) {
      if (link.url.trim()) links.set(link.url.trim(), link);
    }
    if (links.size) linksByCloud[cloud] = [...links.values()];
  }
  const items = new Map<string, Resources["items"][number]>();
  for (const item of [...current.items, ...incoming.items]) {
    const key = item.links?.length ? item.links.map(l => l.url.trim()).sort().join("|") : item.title.trim().toLocaleLowerCase();
    items.set(key, item);
  }
  return { total: Object.values(linksByCloud).reduce((n, links) => n + links.length, 0), linksByCloud, items: [...items.values()] };
}

export function transferSearchResource(link: Resource, title: string, media?: DownloadMediaContext) {
  if (!/^magnet:/i.test(link.url) && !is115ShareURL(link.url)) throw new Error("只支持 115 分享或磁力链接");
  return downloadApi.create({
    kind: is115ShareURL(link.url) ? "share_transfer" : "offline",
    ...(is115ShareURL(link.url) ? { wholeShare: true, receiveCode: link.password || "" } : {}),
    url: link.url,
    directoryId: "",
    reference: { source: "media_search", sourceId: media?.providerId ? `${media.provider}:${media.type}:${media.providerId}` : undefined, media: { ...media, type: media?.type || "movie", title: media?.title || title } },
  });
}
