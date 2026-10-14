import { useEffect, useState } from "react"
import { cn } from "cn"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { getSetupStatus, login, setup } from "@/lib/auth-api"
import type { AuthUser } from "@/lib/auth-api"

export function LoginForm({
  className,
  onLogin,
  ...props
}: React.ComponentProps<"div"> & { onLogin: (user: AuthUser) => void }) {
  const [error, setError] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [setupRequired, setSetupRequired] = useState(false)
  const [isCheckingSetup, setIsCheckingSetup] = useState(true)

  useEffect(() => {
    getSetupStatus()
      .then(({ setupRequired: required }) => setSetupRequired(required))
      .catch((error) => setError(error instanceof Error ? error.message : "无法连接服务端"))
      .finally(() => setIsCheckingSetup(false))
  }, [])

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError("")
    setIsSubmitting(true)

    const formData = new FormData(event.currentTarget)
    const account = String(formData.get("account") ?? "")
    const password = String(formData.get("password") ?? "")
    const confirmPassword = String(formData.get("confirmPassword") ?? "")

    if (setupRequired && password !== confirmPassword) {
      setError("两次输入的密码不一致")
      setIsSubmitting(false)
      return
    }

    try {
      if (setupRequired) {
        onLogin(await setup(account, password))
      } else {
        onLogin(await login(account, password))
      }
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : "登录失败。"
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-xl">{setupRequired ? "创建管理员账号" : "欢迎回来"}</CardTitle>
          <CardDescription>{setupRequired ? "首次使用，请创建单用户管理员账号" : "使用账号和密码登录媒体中心"}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="account">账号</FieldLabel>
                <Input
                  id="account"
                  name="account"
                  type="text"
                  placeholder={setupRequired ? "设置登录账号（3 位以上）" : "请输入账号"}
                  autoComplete="username"
                  required
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="password">密码</FieldLabel>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  placeholder={setupRequired ? "设置登录密码" : "请输入密码"}
                  autoComplete={setupRequired ? "new-password" : "current-password"}
                  required
                />
              </Field>
              {setupRequired && (
                <Field>
                  <FieldLabel htmlFor="confirmPassword">确认密码</FieldLabel>
                  <Input
                    id="confirmPassword"
                    name="confirmPassword"
                    type="password"
                    placeholder="再次输入密码"
                    autoComplete="new-password"
                    required
                  />
                </Field>
              )}
              <Field>
                <Button type="submit" disabled={isSubmitting || isCheckingSetup}>
                  {isSubmitting ? "正在处理…" : isCheckingSetup ? "连接服务端…" : setupRequired ? "创建账号并登录" : "登录"}
                </Button>
                {error && (
                  <FieldDescription role="alert" className="text-center text-destructive">
                    {error}
                  </FieldDescription>
                )}
              </Field>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
