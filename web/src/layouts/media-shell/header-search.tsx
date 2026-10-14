import { useId, useMemo, useState } from "react"
import { SearchIcon } from "lucide-react"
import { Input } from "@/components/ui/input"
import { searchableNavigation } from "./navigation-data"

export function HeaderSearch({
  onNavigate,
}: {
  onNavigate: (path: string) => void
}) {
  const [query, setQuery] = useState("")
  const [activeIndex, setActiveIndex] = useState(0)
  const listId = useId()
  const results = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase()
    if (!normalizedQuery) return []

    return searchableNavigation
      .filter((item) =>
        `${item.title} ${"section" in item ? item.section : ""}`
          .toLocaleLowerCase()
          .includes(normalizedQuery)
      )
      .slice(0, 8)
  }, [query])

  function selectResult(path: string) {
    setQuery("")
    setActiveIndex(0)
    onNavigate(path)
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setQuery("")
      setActiveIndex(0)
      return
    }

    if (event.key === "ArrowDown" && results.length > 0) {
      event.preventDefault()
      setActiveIndex((index) => (index + 1) % results.length)
    }

    if (event.key === "ArrowUp" && results.length > 0) {
      event.preventDefault()
      setActiveIndex((index) => (index - 1 + results.length) % results.length)
    }

    if (event.key === "Enter" && results[activeIndex]) {
      event.preventDefault()
      selectResult(results[activeIndex].path)
    }
  }

  return (
    <div className="relative hidden w-full max-w-sm lg:block">
      <SearchIcon className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="search"
        role="combobox"
        aria-label="搜索菜单"
        aria-autocomplete="list"
        aria-expanded={query.trim().length > 0}
        aria-controls={listId}
        placeholder="搜索菜单…"
        value={query}
        className="h-9 rounded-lg pl-10"
        onChange={(event) => {
          setQuery(event.target.value)
          setActiveIndex(0)
        }}
        onKeyDown={handleKeyDown}
      />

      {query.trim() && (
        <div className="absolute inset-x-0 top-11 z-20 overflow-hidden rounded-lg border bg-popover shadow-md">
          {results.length > 0 ? (
            <ul id={listId} role="listbox" aria-label="菜单搜索结果" className="p-1">
              {results.map((item, index) => {
                const ResultIcon = item.icon
                const section =
                  "section" in item && typeof item.section === "string"
                    ? item.section
                    : ""
                return (
                  <li key={item.path} role="presentation">
                    <button
                      type="button"
                      role="option"
                      aria-selected={activeIndex === index}
                      className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm outline-none hover:bg-accent focus-visible:bg-accent"
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => selectResult(item.path)}
                    >
                      <ResultIcon className="shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate">{item.title}</span>
                      <span className="hidden truncate text-xs text-muted-foreground sm:block">
                        {section}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">
              没有找到匹配的菜单
            </p>
          )}
        </div>
      )}
    </div>
  )
}
