import { useEffect,useRef,useState } from "react";
import { errorText } from "../components/media/MediaUI";
import {
animeApi,
emptyAnimeDraft,
type AnimeDraft,
type AnimePreview,
type MikanGroup,
type MikanItem
} from "../lib/anime-api";
export function useAnimeEditor() {
  const [step, setStep] = useState<"source" | "browse" | "match" | "edit">(
    "source",
  );
  const [selectedGroup, setSelectedGroup] = useState<MikanGroup | null>(null);
  const [selectedRule, setSelectedRule] = useState(-1);
  const [draft, setDraft] = useState<AnimeDraft>(emptyAnimeDraft);
  const [matchText, setMatchText] = useState("");
  const [excludeText, setExcludeText] = useState("");
  const [catalogPage, setCatalogPage] = useState(1);
  const [query, setQuery] = useState("");
  const [season, setSeason] = useState("");
  const [seasons, setSeasons] = useState<string[]>([]);
  const [catalog, setCatalog] = useState<MikanItem[]>([]);
  const [groups, setGroups] = useState<MikanGroup[]>([]);
  const [selected, setSelected] = useState<MikanItem | null>(null);
  const [preview, setPreview] = useState<AnimePreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null);
  const running = useRef(false);
  useEffect(() => () => controller.current?.abort(), []);
  const change = <K extends keyof AnimeDraft>(k: K, v: AnimeDraft[K]) => {
    setDraft((d) => ({ ...d, [k]: v }));
    setPreview(null);
  };
  async function act(fn: () => Promise<void>) {
    if (running.current) return;
    running.current = true;
    controller.current = new AbortController();
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      if (!controller.current?.signal.aborted) setError(errorText(e));
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  async function resolve(value: AnimeDraft) {
    await act(async () => {
      const resolved = await animeApi.resolve(value, controller.current?.signal);
      if (controller.current?.signal.aborted) return;
      setDraft(resolved);
      setMatchText(resolved.match.join("\n"));
      setExcludeText(resolved.exclude.join("\n"));
      setPreview(null);
      setStep("edit");
    });
  }
  async function browse(refresh = false) {
    setStep("browse"); setSelected(null); setGroups([]);
    await act(async () => {
      const r = await animeApi.catalog(query, season, refresh, controller.current?.signal, draft.source);
      if (controller.current?.signal.aborted) return;
      setCatalog(r.items); setSeasons(r.seasons); setCatalogPage(1);
    });
  }
  
  async function selectAnime(item: MikanItem) {
    setSelected(item); setGroups([]);
    await act(async () => {
      const result = await animeApi.groups(item.id, controller.current?.signal, draft.source);
      if (controller.current?.signal.aborted) return;
      setGroups(result); setDraft(d => ({ ...d, title: item.title, poster: item.poster, mikanId: d.source === "mikan" ? item.id : "" }));
    });
  }

return {selectAnime,step,setStep,selectedGroup,setSelectedGroup,selectedRule,setSelectedRule,draft,setDraft,matchText,setMatchText,excludeText,setExcludeText,catalogPage,setCatalogPage,query,setQuery,season,setSeason,seasons,setSeasons,catalog,setCatalog,groups,setGroups,selected,setSelected,preview,setPreview,busy,error,controller,running,change,act,resolve,browse};
}