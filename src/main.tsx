import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { applyTheme, readTheme } from "./theme";
import { applyLocale } from "./i18n";
import "./styles/index.css";

applyTheme(readTheme());
applyLocale();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
