import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import "./index.css"
import App from "./App.tsx"
import { ThemeProvider } from "@/components/theme-provider.tsx"
import { clearResourceSearchResult } from "@/lib/resource-search"

async function startApp() {
  if (
    window.location.pathname === "/search" &&
    new URLSearchParams(window.location.search).has("kw")
  ) {
    window.history.replaceState(null, "", "/search")
  }
  clearResourceSearchResult(sessionStorage)

  if (import.meta.env.DEV && import.meta.env.VITE_ENABLE_MOCKS !== "false") {
    const { worker } = await import("@/mocks/browser")
    await worker.start({ onUnhandledFrame: "bypass" })
  }

  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </StrictMode>
  )
}

void startApp()
