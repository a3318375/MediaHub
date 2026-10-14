import { useEffect, useRef, useState } from "react"
import { EyeIcon, EyeOffIcon } from "lucide-react"
import { settingsApi, type SettingsSection } from "@/lib/settings-api"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"

export function SecretSetting({
  id,
  label,
  section,
  secretKey,
  configured,
  masked,
  value,
  onChange,
  placeholder,
  description,
  multiline = false,
  disabled = false,
}: {
  id: string
  label: string
  section: SettingsSection
  secretKey: string
  configured: boolean
  masked?: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  description?: string
  multiline?: boolean
  disabled?: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [visible, setVisible] = useState(false)
  const [plain, setPlain] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const controller = useRef<AbortController | null>(null)
  useEffect(() => () => controller.current?.abort(), [])
  const isEditing = editing || !configured || value !== ""
  const displayed = isEditing ? value : visible ? plain : masked || "已保存"
  async function toggle() {
    if (visible) {
      setVisible(false)
      setPlain("")
      return
    }
    if (isEditing) {
      setVisible(true)
      return
    }
    const request = new AbortController()
    controller.current = request
    setBusy(true)
    setError("")
    try {
      const result = await settingsApi.reveal(
        section,
        secretKey,
        request.signal
      )
      if (!request.signal.aborted) {
        setPlain(result.value)
        setVisible(true)
      }
    } catch (e) {
      if (!request.signal.aborted)
        setError(e instanceof Error ? e.message : "读取失败")
    } finally {
      if (!request.signal.aborted) setBusy(false)
    }
  }
  function toggleEditing() {
    controller.current?.abort()
    setBusy(false)
    setVisible(false)
    setPlain("")
    setError("")
    if (isEditing) {
      onChange("")
      setEditing(false)
    } else {
      setEditing(true)
    }
  }
  return (
    <Field orientation="horizontal" className="items-start">
      <FieldLabel htmlFor={id} className="!w-28 !flex-none pt-2">
        {label}
      </FieldLabel>
      <FieldContent className="max-w-3xl">
        <div className="flex flex-wrap items-start gap-2">
          {multiline && visible ? (
            <Textarea
              id={id}
              name={id}
              rows={3}
              className="min-w-40 flex-1 break-all"
              value={displayed}
              readOnly={!isEditing}
              disabled={disabled || busy}
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => {
                if (isEditing) onChange(e.target.value)
              }}
            />
          ) : (
            <Input
              id={id}
              name={id}
              className="min-w-40 flex-1"
              type={isEditing && !visible ? "password" : "text"}
              value={displayed}
              readOnly={!isEditing}
              disabled={disabled || busy}
              placeholder={isEditing ? placeholder : undefined}
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => {
                if (isEditing) onChange(e.target.value)
              }}
            />
          )}
          <Button
            type="button"
            variant="outline"
            disabled={disabled || busy || (isEditing && !value)}
            aria-label={`${visible ? "隐藏" : "显示全文"}${label}`}
            aria-pressed={visible}
            onClick={() => void toggle()}
          >
            {visible ? (
              <EyeOffIcon data-icon="inline-start" />
            ) : (
              <EyeIcon data-icon="inline-start" />
            )}
            {busy ? "读取中…" : visible ? "隐藏" : "显示全文"}
          </Button>
          {configured && (
            <Button
              type="button"
              variant="ghost"
              disabled={disabled || busy}
              onClick={toggleEditing}
            >
              {isEditing ? "取消修改" : "修改"}
            </Button>
          )}
        </div>
        <FieldDescription>
          {isEditing && configured
            ? "输入新值以替换；取消修改或留空会保留已保存值。"
            : description}
        </FieldDescription>
        {error && (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        )}
      </FieldContent>
    </Field>
  )
}
