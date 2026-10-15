import { useState } from "react"
import { BellPlusIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { tvApi, type TVSubscription } from "@/lib/tv-api"

export function TVSubscribeButton({
  tmdbId,
  title,
  subscription,
  onSaved,
}: {
  tmdbId: string
  title: string
  subscription?: TVSubscription
  onSaved?: () => void
}) {
  const [open, setOpen] = useState(false)
  const [season, setSeason] = useState(subscription?.season ?? 1)
  const [source, setSource] = useState<"tg" | "pansou">(
    subscription?.source ?? (subscription?.channels?.length ? "tg" : "pansou")
  )
  const [channels, setChannels] = useState(
    subscription?.channels?.join(", ") ?? ""
  )
  const [match, setMatch] = useState(subscription?.match ?? "")
  const [exclude, setExclude] = useState(subscription?.exclude ?? "")
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")
  async function save() {
    if (busy) return
    setBusy(true)
    setMessage("")
    const draft = {
      tmdbId,
      title,
      season,
      source,
      enabled: subscription?.enabled ?? true,
      channels:
        source === "tg" ? channels.split(/[,，\s]+/).filter(Boolean) : [],
      match,
      exclude,
    }
    try {
      if (subscription) await tvApi.update(subscription.id, draft)
      else await tvApi.create(draft)
      setOpen(false)
      setMessage(subscription ? "规则已更新" : "已订阅，可在追剧日历查看")
      onSaved?.()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存失败")
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        onClick={(event) => {
          event.stopPropagation()
          setMessage("")
          setOpen(true)
        }}
      >
        <BellPlusIcon />
        {subscription ? "订阅规则" : "订阅追剧"}
      </Button>
      {!open && message && (
        <span role="status" className="text-xs">
          {message}
        </span>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="sm:max-w-lg"
          onClick={(event) => event.stopPropagation()}
        >
          <DialogHeader>
            <DialogTitle>
              {subscription ? "编辑订阅" : "订阅追剧"} · {title}
            </DialogTitle>
            <DialogDescription>
              按 TMDB 播出日期查找新集；日期未知时每天搜索一次。
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <fieldset className="grid gap-2">
              <legend className="mb-2 text-sm">订阅来源</legend>
              <div className="flex gap-2">
                <Button
                  variant={source === "tg" ? "default" : "outline"}
                  onClick={() => setSource("tg")}
                >
                  TG 频道
                </Button>
                <Button
                  variant={source === "pansou" ? "default" : "outline"}
                  onClick={() => setSource("pansou")}
                >
                  PanSou
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                两种来源互不补搜。到播出日检查，未找到每天补查；找到后等下一集播出再查。
              </p>
            </fieldset>
            <label className="grid gap-2 text-sm">
              订阅第几季
              <Input
                type="number"
                min={1}
                max={100}
                value={season}
                disabled={Boolean(subscription)}
                onChange={(e) => setSeason(Number(e.target.value))}
              />
            </label>
            {source === "tg" && (
              <>
                <label className="grid gap-2 text-sm">
                  公开 TG 频道（必填，多个以逗号分隔）
                  <Input
                    placeholder="例如 https://t.me/vip115hot"
                    value={channels}
                    onChange={(e) => setChannels(e.target.value)}
                  />
                </label>
                <p className="text-xs text-muted-foreground">
                  直接搜索指定频道的公开历史消息，不调用
                  PanSou。暂不支持需要登录的私有频道。
                </p>
              </>
            )}
            {source === "pansou" && (
              <p className="text-xs text-muted-foreground">
                只使用全局 PanSou 搜索配置，不直接检索订阅频道。
              </p>
            )}
            <label className="grid gap-2 text-sm">
              匹配正则（可选）
              <Input
                placeholder="例如 (?i)(4k|2160p)"
                value={match}
                onChange={(e) => setMatch(e.target.value)}
              />
            </label>
            <label className="grid gap-2 text-sm">
              排除正则（可选）
              <Input
                placeholder="例如 (?i)(预告|花絮|720p)"
                value={exclude}
                onChange={(e) => setExclude(e.target.value)}
              />
            </label>
            <p className="text-xs leading-6 text-muted-foreground">
              每集先选符合规则的 115
              分享，再选磁力链接，同类选择标注体积最大的一个。未标体积按未知处理。集数暂支持
              S01E02、第 2 集、EP02 等写法。资源会保存到日历，供你查看与下载。
            </p>
            {message && (
              <p role="alert" className="text-sm text-destructive">
                {message}
              </p>
            )}
            <Button
              disabled={
                busy ||
                !Number.isInteger(season) ||
                season < 1 ||
                season > 100 ||
                (source === "tg" && !channels.trim())
              }
              onClick={() => void save()}
            >
              {busy ? "保存中…" : "保存订阅"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
