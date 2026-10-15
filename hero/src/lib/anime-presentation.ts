







import type { MediaSummary } from "./media-contract";


export function animeMedia(a: {
  id: string;
  title: string;
  poster: string;
  description?: string;
  rating?: string;
  releaseDate?: string;
  originalTitle?: string;
  bangumiId?: string;
}): MediaSummary {
  const rating = Number(a.rating);
  return {
    mediaId: `anime-subscription:${a.id}`,
    provider: "bangumi",
    providerId: a.bangumiId || a.id,
    source: "bangumi",
    sourceId: a.bangumiId || a.id,
    mediaType: "anime",
    title: a.title,
    originalTitle: a.originalTitle,
    posterPath: a.poster,
    overview: a.description,
    year: a.releaseDate
      ? Number(a.releaseDate.slice(0, 4)) || undefined
      : undefined,
    genres: [],
    ratings:
      Number.isFinite(rating) && rating > 0
        ? [{ source: "bangumi", value: rating }]
        : [],
  };
}
