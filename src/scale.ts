// Sizing:
//   --s  the size setting: scales only the Tickies and their speech bubbles (so they can be kept
//        small and inconspicuous at work)
//   --t  text scale from Windows' "Text size" setting: name tags, cards and panels follow the PC
// The desktop window shrinks and grows to fit what is on screen, keeping its bottom-right corner.
import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow, LogicalSize, PhysicalPosition } from "@tauri-apps/api/window";
import { inTauri } from "./clickThrough";

export const SCALES = [
  { value: 0.8, label: "작게" },
  { value: 1, label: "보통" },
  { value: 1.25, label: "크게" },
  { value: 1.5, label: "아주 크게" },
] as const;

const setVar = (name: string, value: number) => document.documentElement.style.setProperty(name, String(value));

export function useTickyScale(scale: number) {
  useEffect(() => setVar("--s", scale), [scale]);
}

/** Follow Windows' text size (Settings → Accessibility → Text size); re-checked now and then. */
export function useTextScale() {
  useEffect(() => {
    if (!inTauri()) return;
    const read = () => invoke<number>("text_scale").then((t) => setVar("--t", t)).catch(() => {});
    read();
    const id = setInterval(read, 30_000);
    return () => clearInterval(id);
  }, []);
}

// everything that can stick out of the window: Tickies (with bubbles), toolbar, cards, panels
const CONTENT = ".pet, .card, .toolbar, .panel, .onboard, .empty";
const MARGIN = 6;     // breathing room around the content, in CSS px
const SHRINK_MS = 700; // wait before shrinking, so hovering in and out doesn't make it jitter

/**
 * Content is anchored to the bottom-left of the window, so anything taller than the window
 * pokes out of the top. Measure that and resize the window to fit, growing at once and
 * shrinking after a short pause. The bottom-right corner stays where the user put it.
 */
export function useAutoWindowSize() {
  useEffect(() => {
    if (!inTauri()) return;
    const win = getCurrentWindow();
    let busy = false;
    let shrinkSince = 0;

    const tick = async () => {
      if (busy) return;
      const els = [...document.querySelectorAll(CONTENT)];
      if (els.length === 0) return;
      let top = Infinity, right = 0;
      for (const el of els) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) continue;
        top = Math.min(top, r.top);
        right = Math.max(right, r.right);
      }
      if (!Number.isFinite(top)) return;
      const needW = Math.ceil(right + MARGIN);
      const needH = Math.ceil(window.innerHeight - top + MARGIN);
      const dw = needW - window.innerWidth, dh = needH - window.innerHeight;
      if (Math.abs(dw) <= 2 && Math.abs(dh) <= 2) { shrinkSince = 0; return; }
      const growing = dw > 2 || dh > 2;
      if (!growing) {
        if (!shrinkSince) { shrinkSince = Date.now(); return; }
        if (Date.now() - shrinkSince < SHRINK_MS) return;
      }
      shrinkSince = 0;
      busy = true;
      try {
        const [pos, size] = await Promise.all([win.outerPosition(), win.outerSize()]);
        const right0 = pos.x + size.width, bottom0 = pos.y + size.height;
        await win.setSize(new LogicalSize(Math.max(needW, 120), Math.max(needH, 80)));
        const next = await win.outerSize();
        await win.setPosition(new PhysicalPosition(right0 - next.width, bottom0 - next.height));
      } catch { /* window API unavailable: leave the size as it is */ }
      busy = false;
    };

    const id = setInterval(tick, 150);
    return () => clearInterval(id);
  }, []);
}
