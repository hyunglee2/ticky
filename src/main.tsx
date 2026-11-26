import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { Settings } from "./components/Settings";
import { Tease } from "./components/Tease";
import { Welcome } from "./components/Onboarding";
import { Dress } from "./components/Dress";
import logo from "../design/ticky-logo.svg";

// one bundle, three windows: the Tickies' transparent strip, the settings window (?view=settings),
// 괴롭히기 (?view=tease&s=SYMBOL), a transparent window over the whole screen, or the first-run
// market picker (?view=welcome), a small transparent window in the middle of the screen
const params = new URLSearchParams(location.search);
const view = params.get("view");
if (view === "settings") document.documentElement.classList.add("settings-page");
if (view === "tease" || view === "dress") document.documentElement.classList.add("tease-page");
if (view === "welcome") document.documentElement.classList.add("welcome-page");
// the corner logo while it's dragged to another monitor: a tiny window that follows the cursor
if (view === "drag") document.documentElement.classList.add("drag-page");

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    {view === "settings" ? <Settings />
      : view === "tease" ? <Tease symbol={params.get("s") ?? ""} />
      : view === "dress" ? <Dress symbol={params.get("s") ?? ""} />
      : view === "welcome" ? <Welcome />
      : view === "drag" ? <img className="drag-logo" src={logo} alt="" draggable={false} />
      : <App />}
  </React.StrictMode>,
);
