import { useId, useState, type FormEvent } from "react";
import { Button, Chip } from "@heroui/react";
import { Overlay } from "../../components/ui/Overlay";
import { type TV, type TVDraft } from "../../lib/media-service";
import { errorText, FilterTabs } from "../../components/media/MediaUI";
import { Field, SelectField } from "../../components/ui/ManagementUI";

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function generatedRule(title: string, quality: string) {
  const name = escapeRegex(title.trim());
  const condition = quality === "4k" ? "(?=.*(?:4K|2160P|UHD))" : quality === "1080" ? "(?=.*1080P)" : "";
  return `(?i)^(?=.*${name})${condition}.*$`;
}
function normalizeTag(raw: string, source: boolean) {
  let value = raw.trim();
  const telegram = /^(?:https?:\/\/)?t\.me\/(?:s\/)?([a-z0-9_]+)(?:\/\d+)?\/?(?:\?.*)?$/i.exec(value);
  if (telegram) value = telegram[1];
  if (!source) {
    value = value.replace(/^@/, "");
    if (!/^[a-z0-9_]{1,32}$/i.test(value)) throw new Error("请输入公开频道用户名或 t.me 链接");
    return value.toLowerCase();
  }
  if (telegram || value.startsWith("@")) value = `tg:${value.replace(/^@/, "")}`;
  else if (!value.includes(":")) value = `plugin:${value}`;
  if (!/^(plugin|tg):[a-z0-9_-]{1,64}$/i.test(value)) throw new Error("请输入插件名、plugin:插件名或公开频道链接");
  return value.toLowerCase();
}
function SourceTags({label, values, onChange, source = false}: {
  label: string; values: string[]; onChange: (v: string[]) => void; source?: boolean;
}) {
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const listId = useId();
  function commit(raw = input) {
    if (!raw.trim()) return;
    try {
      const added = raw.split(/[,，\s]+/).filter(Boolean).map(v => normalizeTag(v, source));
      const next = [...new Set([...values, ...added])];
      if (next.length > 20) throw new Error("最多添加 20 个来源");
      onChange(next); setInput(""); setError("");
    } catch (e) { setError(errorText(e)); }
  }
  function move(index: number, offset: number) {
    const next = [...values]; [next[index], next[index + offset]] = [next[index + offset], next[index]]; onChange(next);
  }
  return <div className="tv-source-field">
    <label htmlFor={listId}>{label}</label>
    <div className="tv-source-tags">
      {values.map((value,index) => <Chip key={value} variant="soft" className="tv-source-tag">
        <span className="tv-source-order">{index + 1}</span><span>{value}</span>
        {index > 0 && <button type="button" aria-label={`提高 ${value} 优先级`} onClick={() => move(index,-1)}>↑</button>}
        {index < values.length - 1 && <button type="button" aria-label={`降低 ${value} 优先级`} onClick={() => move(index,1)}>↓</button>}
        <button type="button" aria-label={`移除 ${value}`} onClick={() => onChange(values.filter(v=>v!==value))}>×</button>
      </Chip>)}
      <input ref={element => { if (element) element.setCustomValidity(error); }} id={listId} aria-label={label} value={input}
        placeholder={source ? "输入插件名或频道链接，回车添加" : "粘贴 https://t.me/频道，回车添加"}
        onChange={e => setInput(e.target.value)} onBlur={() => commit()}
        onKeyDown={e => { if (e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); commit(); } }}
        onPaste={e => { const text=e.clipboardData.getData("text"); if (/[,，\s]/.test(text.trim())) { e.preventDefault(); commit(text); } }} />
    </div>
    {error && <p role="alert" className="media-error">{error}</p>}
    <p className="media-note">按标签顺序优先选择资源；可用箭头调整顺序，点击 × 移除。</p>
  </div>;
}
export function TVEditor({value,close,submit}: {value: TV | TVDraft;close:()=>void;submit:(d:TVDraft)=>Promise<void>}) {
  const [draft,setDraft] = useState<TVDraft>({...value, sources:value.sources || [], match:value.match || generatedRule(value.title,"any")});
  const [quality,setQuality] = useState(() => /2160|4k|uhd/i.test(value.match) ? "4k" : /1080/i.test(value.match) ? "1080" : "any");
  const [error,setError] = useState("");
  const [busy,setBusy] = useState(false);
  async function saveDraft(e:FormEvent) {
    e.preventDefault();setError("");
    if (!draft.title.trim() || !/^\d+$/.test(draft.tmdbId)) {setError("请从作品详情中选择电视剧后订阅。");return;}
    if (draft.source==="tg" && !draft.channels.length) {setError("请至少添加一个公开频道。");return;}
    setBusy(true);
    try {await submit({...draft,channels:draft.source==="tg"?draft.channels:[]});}catch(e){setError(errorText(e));}finally{setBusy(false);}
  }
  return <Overlay title={"id" in value ? "编辑追剧规则" : "订阅此剧"} onClose={close}>
    <form className="management-stack tv-subscription-editor" onSubmit={saveDraft}>
      <div className="tv-subscription-summary"><h3>{value.title || "请选择作品"}</h3><span>{draft.season===0 ? "全部季度 · 持续跟踪新季度" : `第 ${draft.season} 季 · 已有订阅`}</span></div>
      <FilterTabs label="资源来源" value={draft.source} options={[["pansou","PanSou"],["tg","TG 公开频道"]]} onChange={v=>setDraft({...draft,source:v as TVDraft["source"]})}/>
      {draft.source==="tg" ? <SourceTags label="公开频道" values={draft.channels} onChange={channels=>setDraft({...draft,channels})}/>
      : <SourceTags label="优先来源（可选）" source values={draft.sources || []} onChange={sources=>setDraft({...draft,sources})}/>}
      {draft.source==="pansou" && !draft.sources?.length && <p className="media-note">未指定时使用全局搜索来源；例如输入 xiaokupan，或粘贴公开频道链接。</p>}
      <SelectField label="清晰度" value={quality} options={[["any","不限"],["4k","4K / 2160P / UHD"],["1080","1080P"]]} onChange={quality=>{setQuality(quality);setDraft({...draft,match:generatedRule(draft.title,quality)});}}/>
      <details className="tv-advanced"><summary>高级规则</summary><div className="management-stack">
        <Field label="资源匹配正则" value={draft.match} onChange={match=>setDraft({...draft,match})}/>
        <Field label="排除正则" value={draft.exclude} onChange={exclude=>setDraft({...draft,exclude})}/>
        <FilterTabs label="订阅状态" value={draft.enabled?"on":"off"} options={[["on","启用"],["off","暂停"]]} onChange={v=>setDraft({...draft,enabled:v==="on"})}/>
      </div></details>
      <p className="media-note">自动匹配作品名称与清晰度，并识别季集及更新进度。默认不限定年份，避免漏掉后续季度。</p>
      {error && <p role="alert" className="media-error">{error}</p>}
      <div className="anime-step-actions"><Button variant="secondary" onPress={close} isDisabled={busy}>取消</Button><Button type="submit" isDisabled={busy || !draft.tmdbId}>{busy?"正在保存…":"保存订阅"}</Button></div>
    </form>
  </Overlay>;
}
