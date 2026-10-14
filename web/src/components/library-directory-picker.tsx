import { useEffect, useState } from "react"
import { downloadApi, type DownloadFile } from "@/lib/download-api"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
export function LibraryDirectoryPicker({
  onClose,
  onSelect,
}: {
  onClose: () => void
  onSelect: (id: string, path: string) => void
}) {
  const [stack, setStack] = useState<{ id: string; name: string }[]>([
    { id: "0", name: "115" },
  ])
  const [items, setItems] = useState<DownloadFile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const current = stack[stack.length - 1]
  function navigate(next: typeof stack) {
    setLoading(true)
    setError("")
    setStack(next)
  }
  useEffect(() => {
    const c = new AbortController()
    void downloadApi
      .directories(current.id, c.signal)
      .then((r) => {
        if (!c.signal.aborted) setItems(r.items)
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message)
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false)
      })
    return () => c.abort()
  }, [current.id])
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>选择 115 文件夹</DialogTitle>
          <DialogDescription>
            {stack.map((s) => s.name).join(" / ")}
          </DialogDescription>
        </DialogHeader>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <Button
          variant="outline"
          disabled={stack.length === 1 || loading}
          onClick={() => navigate(stack.slice(0, -1))}
        >
          返回上一级
        </Button>
        <div className="flex max-h-72 flex-col gap-2 overflow-y-auto">
          {loading ? (
            <p className="text-sm text-muted-foreground">读取文件夹中…</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-muted-foreground">没有子文件夹。</p>
          ) : (
            items.map((f) => (
              <Button
                key={f.id}
                variant="ghost"
                className="justify-start"
                onClick={() => navigate([...stack, { id: f.id, name: f.name }])}
              >
                {f.name}
              </Button>
            ))
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button
            disabled={loading || !!error || current.id === "0"}
            onClick={() =>
              onSelect(
                current.id,
                stack
                  .slice(1)
                  .map((s) => s.name)
                  .join("/")
              )
            }
          >
            使用此文件夹
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
