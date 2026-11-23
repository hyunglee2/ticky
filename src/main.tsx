import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { Settings } from "./components/Settings";
import { Tease } from "./components/Tease";

// one bundle, three windows: the Tickies' transparent strip, the settings window (?view=settings),
// or 괴롭히기 (?view=tease&s=SYMBOL), a transparent window over the whole screen
const params = new URLSearchParams(location.search);
const view = params.get("view");
if (view === "settings") document.documentElement.classList.add("settings-page");
if (view === "tease") document.documentElement.classList.add("tease-page");

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    {view === "settings" ? <Settings /> : view === "tease" ? <Tease symbol={params.get("s") ?? ""} /> : <App />}
  </React.StrictMode>,
);
