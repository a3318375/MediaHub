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
      enabled: subscription?.enabled ?? true,
      channels: channels.split(/[,，\s]+/).filter(Boolean),
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
            <label className="grid gap-2 text-sm">
              PanSou 公开 TG 频道（可选，多个以逗号分隔）
              <Input
                placeholder="频道用户名、@username 或 https://t.me/username"
                value={channels}
                onChange={(e) => setChannels(e.target.value)}
              />
            </label>
            <p className="text-xs text-muted-foreground">
              指定后只搜索这些频道；留空使用全局 PanSou 搜索来源。
            </p>
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
                busy || !Number.isInteger(season) || season < 1 || season > 100
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
