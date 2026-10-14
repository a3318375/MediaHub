import { useSyncExternalStore } from "react"
import { MoonIcon, SunIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useTheme } from "@/components/theme-provider"

const COLOR_SCHEME_QUERY = "(prefers-color-scheme: dark)"

function subscribeToColorScheme(onChange: () => void) {
  const mediaQuery = window.matchMedia(COLOR_SCHEME_QUERY)
  mediaQuery.addEventListener("change", onChange)
  return () => mediaQuery.removeEventListener("change", onChange)
}

function getSystemDarkSnapshot() {
  return window.matchMedia(COLOR_SCHEME_QUERY).matches
}

export function ThemeToggle() {
  const { setTheme, theme } = useTheme()
  const systemIsDark = useSyncExternalStore(
    subscribeToColorScheme,
    getSystemDarkSnapshot,
    () => false
  )
  const isDark = theme === "dark" || (theme === "system" && systemIsDark)

  function toggleTheme() {
    setTheme(isDark ? "light" : "dark")
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-lg"
      className="rounded-full"
      aria-label={isDark ? "切换到浅色主题" : "切换到深色主题"}
      title={isDark ? "切换到浅色主题" : "切换到深色主题"}
      onClick={toggleTheme}
    >
      {isDark ? <SunIcon data-icon="inline-start" /> : <MoonIcon data-icon="inline-start" />}
    </Button>
  )
}
