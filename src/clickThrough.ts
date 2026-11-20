// Click-through: tell the Rust side where the interactive parts are, so the transparent
// rest of the window lets clicks fall through to whatever is behind it.
import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

export const inTauri = () => "__TAURI_INTERNALS__" in window;

const SELECTOR = ".pet, .card, .toolbar, .panel, .onboard";
const PAD = 4; // a little slack around each part so the edge isn't fiddly

export function useClickThroughRegions() {
  useEffect(() => {
    if (!inTauri()) return;
    let last = "";
    const send = () => {
      const rects = [...document.querySelectorAll(SELECTOR)].map((el) => {
        const r = el.getBoundingClientRect();
        return [r.left - PAD, r.top - PAD, r.width + PAD * 2, r.height + PAD * 2].map(Math.round);
      });
      const key = JSON.stringify(rects);
      if (key === last) return;
      last = key;
      invoke("set_hit_regions", { rects }).catch(() => { /* app not ready yet; next tick retries */ last = ""; });
    };
    send();
    // layout changes with hover cards, panels, adding/removing stocks and the size setting
    const id = setInterval(send, 150);
    return () => clearInterval(id);
  }, []);
}
