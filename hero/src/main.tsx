import { StrictMode, Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import App from "./layouts/MediaApp";
import "./styles/base.css";
import "./styles/media.css";
const Template = lazy(() => import("./mocks/dashboard-template"));
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {new URLSearchParams(window.location.search).get("template") ===
    "dashboard" ? (
      <Suspense fallback={<p>正在加载演示…</p>}>
        <Template />
      </Suspense>
    ) : (
      <App />
    )}
  </StrictMode>,
);
