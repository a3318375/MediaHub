import { useCallback, useEffect, useState } from "react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { apiKeysApi, type APIKeyInfo } from "@/lib/api-keys-api"
import {
  CheckIcon,
  CopyIcon,
  KeyRoundIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react"

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString() : "从未使用"
}

export function APIKeysPanel() {
  const [keys, setKeys] = useState<APIKeyInfo[]>([])
  const [name, setName] = useState("")
  const [newKey, setNewKey] = useState("")
  const [notice, setNotice] = useState("")
  const [dialogError, setDialogError] = useState("")
  const [dialogNotice, setDialogNotice] = useState("")
  const [busy, setBusy] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [pendingRevoke, setPendingRevoke] = useState<APIKeyInfo | null>(null)

  const refresh = useCallback(async () => setKeys(await apiKeysApi.list()), [])
  useEffect(() => {
    let active = true
    apiKeysApi
      .list()
      .then((items) => {
        if (active) setKeys(items)
      })
      .catch((error) => {
        if (active) {
          setNotice(
            error instanceof Error ? error.message : "读取 API Key 失败"
          )
        }
      })
    return () => {
      active = false
    }
  }, [])

  function openCreateDialog() {
    setName("")
    setNewKey("")
    setDialogError("")
    setDialogNotice("")
    setNotice("")
    setDialogOpen(true)
  }

  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const normalized = name.trim()
    if (!normalized || busy) return
    setBusy(true)
    try {
      const result = await apiKeysApi.create(normalized)
      setKeys((current) => [result.item, ...current])
      setNewKey(result.key)
      setName("")
      setNotice("")
      setDialogError("")
    } catch (error) {
      setDialogError(
        error instanceof Error ? error.message : "创建 API Key 失败"
      )
    } finally {
      setBusy(false)
    }
  }

  async function revoke(item: APIKeyInfo) {
    if (item.revokedAt || busy) return
    setBusy(true)
    try {
      await apiKeysApi.revoke(item.id)
      await refresh()
      setNotice(`已撤销「${item.name}」。`)
      setPendingRevoke(null)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "撤销 API Key 失败")
    } finally {
      setBusy(false)
    }
  }

  async function copyKey() {
    try {
      await navigator.clipboard.writeText(newKey)
      setDialogNotice("密钥已复制，请妥善保管。")
    } catch {
      setDialogError("无法访问剪贴板，请选中密钥后手动复制。")
    }
  }

  function closeDialog(open: boolean) {
    setDialogOpen(open)
    if (!open) {
      setNewKey("")
      setDialogError("")
      setDialogNotice("")
    }
  }

  return (
    <section className="flex flex-col gap-5 pt-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <KeyRoundIcon />
            API 密钥
          </h2>
          <p className="max-w-3xl text-sm text-muted-foreground">
            为 Hermes 等自动化客户端创建独立密钥。密钥仅用于调用版本化应用
            API；账号、配置和密钥管理仍需网页登录。
          </p>
        </div>
        <Button onClick={openCreateDialog}>
          <PlusIcon data-icon="inline-start" />
          新增密钥
        </Button>
      </div>

      {notice && (
        <Alert>
          <AlertDescription role="status">{notice}</AlertDescription>
        </Alert>
      )}

      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>名称</TableHead>
              <TableHead>API Key</TableHead>
              <TableHead>创建时间</TableHead>
              <TableHead>最近使用</TableHead>
              <TableHead>状态</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {keys.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="h-24 text-center text-muted-foreground"
                >
                  还没有 API 密钥。
                </TableCell>
              </TableRow>
            ) : (
              keys.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">{item.name}</TableCell>
                  <TableCell className="font-mono text-muted-foreground">
                    {item.prefix}••••••••••••
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {formatDate(item.createdAt)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {formatDate(item.lastUsedAt)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={item.revokedAt ? "outline" : "secondary"}>
                      {item.revokedAt ? "已撤销" : "有效"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {item.revokedAt ? (
                      <span className="text-sm text-muted-foreground">
                        已失效
                      </span>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busy}
                        onClick={() => setPendingRevoke(item)}
                      >
                        <Trash2Icon data-icon="inline-start" />
                        撤销
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <CheckIcon />
        密钥只保存 SHA-256 摘要，完整密钥仅在创建时显示一次。认证示例：
        <code>Authorization: Bearer &lt;API_KEY&gt;</code>
      </p>

      <Dialog open={dialogOpen} onOpenChange={closeDialog}>
        <DialogContent>
          {newKey ? (
            <>
              <DialogHeader>
                <DialogTitle>API Key 已生成</DialogTitle>
                <DialogDescription>
                  完整密钥只会显示这一次。请立即复制并保存到客户端。
                </DialogDescription>
              </DialogHeader>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="generated-api-key">API Key</FieldLabel>
                  <Input
                    id="generated-api-key"
                    readOnly
                    value={newKey}
                    className="font-mono"
                    onFocus={(event) => event.currentTarget.select()}
                  />
                  <FieldDescription>
                    关闭此弹窗后，服务端无法再次显示完整密钥。
                  </FieldDescription>
                  {dialogNotice && (
                    <FieldDescription role="status">
                      {dialogNotice}
                    </FieldDescription>
                  )}
                  {dialogError && (
                    <FieldDescription className="text-destructive" role="alert">
                      {dialogError}
                    </FieldDescription>
                  )}
                </Field>
              </FieldGroup>
              <DialogFooter>
                <Button variant="outline" onClick={() => void copyKey()}>
                  <CopyIcon data-icon="inline-start" />
                  复制密钥
                </Button>
                <Button onClick={() => closeDialog(false)}>完成</Button>
              </DialogFooter>
            </>
          ) : (
            <form onSubmit={(event) => void create(event)}>
              <DialogHeader>
                <DialogTitle>新增 API 密钥</DialogTitle>
                <DialogDescription>
                  为密钥设置一个便于识别的名称，系统会自动生成安全密钥。
                </DialogDescription>
              </DialogHeader>
              <FieldGroup className="py-5">
                <Field>
                  <FieldLabel htmlFor="api-key-name">名称</FieldLabel>
                  <Input
                    id="api-key-name"
                    autoFocus
                    autoComplete="off"
                    maxLength={64}
                    placeholder="例如 Hermes 家庭助手"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    required
                  />
                  {dialogError && (
                    <FieldDescription className="text-destructive" role="alert">
                      {dialogError}
                    </FieldDescription>
                  )}
                </Field>
              </FieldGroup>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => closeDialog(false)}
                >
                  取消
                </Button>
                <Button type="submit" disabled={!name.trim() || busy}>
                  <KeyRoundIcon data-icon="inline-start" />
                  生成密钥
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={pendingRevoke !== null}
        onOpenChange={(open) => {
          if (!open) setPendingRevoke(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>撤销 API Key</DialogTitle>
            <DialogDescription>
              撤销「{pendingRevoke?.name}
              」后，使用它的客户端将立即失去访问权限。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => setPendingRevoke(null)}
            >
              取消
            </Button>
            <Button
              variant="destructive"
              disabled={!pendingRevoke || busy}
              onClick={() => pendingRevoke && void revoke(pendingRevoke)}
            >
              <Trash2Icon data-icon="inline-start" />
              撤销密钥
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}
