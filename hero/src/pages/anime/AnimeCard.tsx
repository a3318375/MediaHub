import { Button,Card,Chip } from "@heroui/react";
import { Clock3,Download,RefreshCw } from "lucide-react";
import { MediaImage } from "../../components/media/MediaUI";
import { Notice } from "../../components/ui/ManagementUI";
import { presentAnime,type SavedAnimeSubscription } from "../../lib/anime-api";
import { image } from "../../lib/media-service";

export function AnimeCard({anime, busy, open, action, downloads}: {anime: SavedAnimeSubscription; busy: boolean; open: () => void; action: (refresh: boolean) => void; downloads: () => void}) {
  const view = presentAnime(anime);
  return <Card className="anime-subscription-card">
    <button className="anime-card-cover" aria-label={`查看 ${anime.title}`} onClick={open}>
      {anime.poster && <MediaImage src={image(anime.poster)!} alt={anime.title}/>}
      <div className="anime-card-badges"><Chip size="sm">{view.status}</Chip><Chip size="sm">{view.rating}</Chip></div>
      <span className="anime-card-rss">RSS 订阅</span>
    </button>
    <div className="anime-card-body">
      <button className="anime-card-title" onClick={open}>{anime.title}</button>
      <p>{anime.totalEpisodes ? anime.lastCheckedAt ? `已发现 ${anime.knownEpisodes.filter(e => e >= 1 && e <= anime.totalEpisodes).length} / ${anime.totalEpisodes} 集` : `共 ${anime.totalEpisodes} 集 · 尚未同步` : anime.lastCheckedAt ? `资源更新至 ${anime.latestEpisode} 集 · 总集数未知` : "总集数未知 · 尚未同步"}</p>
      <div className="anime-card-update"><span><Clock3 size={13}/>{view.nextUpdate}</span><span>{view.nextEpisode}</span></div>
      <div className="anime-card-actions">
        <Button isIconOnly size="sm" variant="ghost" aria-label={`查看《${anime.title}》下载记录`} onPress={downloads}><Download size={16}/></Button>
        {!anime.completed && <Button size="sm" variant="ghost" isDisabled={busy} onPress={() => action(false)}>{anime.enabled ? "暂停" : "恢复"}</Button>}
        <Button isIconOnly size="sm" variant="ghost" isDisabled={busy || anime.completed} aria-label={`刷新《${anime.title}》订阅`} onPress={() => action(true)}><RefreshCw className={busy ? "animate-spin" : undefined} size={16}/></Button>
      </div>
      <Notice error={anime.lastError}/><Notice error={anime.metadataError}/>
    </div>
  </Card>;
}
