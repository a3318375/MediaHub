import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./layouts/MediaApp";
import Template from "./mocks/dashboard-template";
import "./styles/base.css";
import "./styles/media.css";
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {new URLSearchParams(window.location.search).get("template") ===
    "dashboard" ? (
      <Template />
    ) : (
      <App />
    )}
  </StrictMode>,
);
