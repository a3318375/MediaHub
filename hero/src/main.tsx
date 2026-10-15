import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./MediaApp";
import Template from "./App";
import "./styles.css";
import "./media.css";
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
