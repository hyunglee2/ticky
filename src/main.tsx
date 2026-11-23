import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { Settings } from "./components/Settings";

// one bundle, two windows: the Tickies' transparent strip, or the settings window (?view=settings)
const isSettings = new URLSearchParams(location.search).get("view") === "settings";
if (isSettings) document.documentElement.classList.add("settings-page");

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    {isSettings ? <Settings /> : <App />}
  </React.StrictMode>,
);
