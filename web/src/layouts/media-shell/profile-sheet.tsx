import { useState } from "react"
import {
  LogOutIcon,
  MailIcon,
  Settings2Icon,
  UserRoundIcon,
} from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import type { AuthUser } from "@/lib/auth-api"

function getInitials(name: string) {
  const normalizedName = name.trim()
  if (/\p{Script=Han}/u.test(normalizedName)) {
    return [...normalizedName].slice(0, 2).join("")
  }

  return normalizedName
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] ?? "")
    .join("")
    .toUpperCase()
}

export function ProfileSheet({
  user,
  onLogout,
  onNavigate,
}: {
  user: AuthUser
  onLogout: () => void
  onNavigate: (path: string) => void
}) {
  const [open, setOpen] = useState(false)

  function openSettings() {
    setOpen(false)
    onNavigate("/settings")
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-lg"
            className="rounded-full"
            aria-label={`打开${user.name}的用户菜单`}
            title="用户菜单"
          />
        }
      >
        <Avatar>
          <AvatarImage src={user.avatar} alt="" />
          <AvatarFallback>{getInitials(user.name)}</AvatarFallback>
        </Avatar>
      </SheetTrigger>

      <SheetContent side="right" className="w-full sm:max-w-sm">
        <SheetHeader className="items-center border-b px-6 pb-6 pt-12 text-center">
          <Avatar size="lg" className="mb-2">
            <AvatarImage src={user.avatar} alt="" />
            <AvatarFallback>{getInitials(user.name)}</AvatarFallback>
          </Avatar>
          <SheetTitle>{user.name}</SheetTitle>
          <SheetDescription className="flex items-center gap-2">
            <MailIcon />
            {user.email || user.account}
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-2 px-4 pt-4">
          <Button
            type="button"
            variant="ghost"
            className="justify-start"
            onClick={openSettings}
          >
            <Settings2Icon data-icon="inline-start" />
            全局设置
          </Button>
          <div className="flex items-center gap-3 px-3 py-2 text-sm text-muted-foreground">
            <UserRoundIcon />
            <span className="truncate">账号：{user.account}</span>
          </div>
        </div>

        <SheetFooter className="border-t px-6 py-4">
          <SheetClose
            render={
              <Button
                type="button"
                variant="destructive"
                className="w-full"
                onClick={onLogout}
              />
            }
          >
            <LogOutIcon data-icon="inline-start" />
            退出登录
          </SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
