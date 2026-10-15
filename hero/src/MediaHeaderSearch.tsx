import { useId, useState } from "react";
import { navigationItems } from "./parity";

export function HeaderSearch({
  navigate,
}: {
  navigate: (page: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const id = useId();
  const results = navigationItems.filter(([, label, section]) =>
    `${label} ${section}`
      .toLocaleLowerCase()
      .includes(query.trim().toLocaleLowerCase()),
  );
  const select = (page: string) => {
    setQuery("");
    setActive(0);
    navigate(page);
  };
  return (
    <div className="header-menu-search">
      <input
        type="search"
        role="combobox"
        aria-label="搜索菜单"
        aria-autocomplete="list"
        aria-expanded={!!query.trim()}
        aria-controls={id}
        aria-activedescendant={
          query.trim() && results[active] ? `${id}-${active}` : undefined
        }
        placeholder="搜索菜单…"
        value={query}
        onBlur={(event) => {
          if (!event.currentTarget.parentElement?.contains(event.relatedTarget))
            setQuery("");
        }}
        onChange={(event) => {
          setQuery(event.target.value);
          setActive(0);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setQuery("");
            setActive(0);
          }
          if (results.length && ["ArrowDown", "ArrowUp"].includes(event.key)) {
            event.preventDefault();
            setActive(
              (index) =>
                (index + (event.key === "ArrowDown" ? 1 : results.length - 1)) %
                results.length,
            );
          }
          if (event.key === "Enter" && query.trim() && results[active]) {
            event.preventDefault();
            select(results[active][0]);
          }
        }}
      />
      {query.trim() && (
        <ul id={id} role="listbox" aria-label="菜单搜索结果">
          {results.length ? (
            results.map(([page, label, section], index) => (
              <li key={page} role="presentation">
                <button
                  id={`${id}-${index}`}
                  role="option"
                  aria-selected={active === index}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => select(page)}
                >
                  {label}
                  <small>{section}</small>
                </button>
              </li>
            ))
          ) : (
            <li>没有找到匹配的菜单</li>
          )}
        </ul>
      )}
    </div>
  );
}
