import { useEffect, useState } from "react";

import type { MediaSummary } from "../../lib/media-contract";

import { errorText, PosterGrid, type API } from "./MediaUI";

export function HomeRecommendations({
  api,
  open,
}: {
  api: API;
  open: (m: MediaSummary) => void;
}) {
  const [items, setItems] = useState<MediaSummary[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    api
      .ranking("tmdb", "movie_day")
      .then((v) => {
        if (active) setItems(v.slice(0, 6));
      })
      .catch((e) => {
        if (active) setError(errorText(e));
      });
    return () => {
      active = false;
    };
  }, [api]);
  return error ? (
    <p role="alert" className="media-error">
      {error}
    </p>
  ) : (
    <PosterGrid items={items} open={open} />
  );
}
