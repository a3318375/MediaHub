import { createContext, useContext } from "react"
import type {
  MediaSource,
  MediaType,
  ProviderRating,
} from "@/lib/media-contract"

export type MediaDetailRecord = {
  posterPath?: string | null
  backdropPath?: string | null
  provider?: MediaSource
  providerId?: string
  mediaId?: string
  sourceId?: string
  source?: MediaSource
  sourceLabel?: string
  mediaType?: MediaType
  ratings?: ProviderRating[]
  credits?: Array<{
    name: string
    role: string
    personId?: string
    profilePath?: string | null
  }>
  seasons?: Array<{
    seasonNumber: number
    episodeCount?: number
    name?: string
  }>
  title: string
  titles?: {
    native?: string
    english?: string
    romaji?: string
    synonyms?: string[]
  }
  stale?: boolean
  detailLoading?: boolean
  detailError?: string
  originalTitle?: string
  kind: string
  year?: number
  originCountries?: string[]
  externalIds?: { imdb?: string; tmdb?: string }
  region?: string
  rating?: number | string
  genres?: string[]
  summary?: string
  palette?: string
  artwork?: string
  status?: string
  episodeInfo?: string
  actionLabel?: string
  onAction?: () => void
}

export const MediaDetailContext = createContext<
  (media: MediaDetailRecord) => void
>(() => undefined)

export function useMediaDetail() {
  return useContext(MediaDetailContext)
}
