import React from "react";
import ReactDOM from "react-dom/client";
import App from "./app/App";
import { applyTheme, readTheme } from "./shared/theme";
import { applyLocale } from "./i18n";
import "./styles/index.css";

applyTheme(readTheme());
applyLocale();

// The window starts hidden (no blank frame before the page): show it once the loader from index.html is painted.
if ("__TAURI_INTERNALS__" in window) {
  requestAnimationFrame(() => {
    void import("@tauri-apps/api/window").then(({ getCurrentWindow }) => getCurrentWindow().show()).catch(() => {});
  });
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
