// Sizing:
//   --s  the size setting: scales only the Tickies and their speech bubbles (so they can be kept
//        small and inconspicuous at work)
//   --t  text scale from Windows' "Text size" setting: name tags, cards and panels follow the PC
// The desktop window spans the bottom of the screen; its height follows what is on screen.
import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
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
const CONTENT = ".pet, .above, .card, .menu, .ticker, .toolbar, .panel, .onboard, .empty";
const MARGIN = 6;      // breathing room around the content, in CSS px
const SHRINK_MS = 1500; // wait before shrinking (after a panel closes)
const PANEL_EST = 290; // tallest toolbar panel (settings with both price sources, or the watchlist), same units
const CARD_EST = 170;  // details card height in text units (a bit over the real ~130-150), until one is measured

/**
 * Resizing a transparent window makes Windows repaint it, which shows as a flicker. So the
 * height always leaves room for everything that pops up: the details card above every head
 * (taller than any speech bubble) or beside a price row, and the toolbar's panels. Hovering,
 * chatter and opening panels never resize the window.
 */
let cardHeight = 0;
let panelHeight = 0;
function reservedTop(): number {
  const card = document.querySelector(".card");
  if (card) cardHeight = Math.max(cardHeight, card.getBoundingClientRect().height);
  const t = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--t")) || 1;
  const s = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--s")) || 1;
  // never less than the estimate, so measuring the first real card doesn't cause a resize either
  const h = Math.max(cardHeight, CARD_EST * t);
  let top = Infinity;
  for (const fig of document.querySelectorAll<HTMLElement>(".figure")) {
    const head = parseFloat(fig.style.getPropertyValue("--head")) || 100; // SVG units
    const anchor = fig.getBoundingClientRect().bottom - (head * 102 / 140) * s - 2;
    top = Math.min(top, anchor - h);
  }
  // the toolbar's panels (settings, watchlist) open upward from its bottom: keep room for the
  // tallest so opening one never resizes the window either
  const toolbar = document.querySelector(".toolbar");
  const panel = document.querySelector(".panel");
  if (panel) panelHeight = Math.max(panelHeight, panel.getBoundingClientRect().height);
  if (toolbar) top = Math.min(top, toolbar.getBoundingClientRect().bottom - Math.max(panelHeight, PANEL_EST * t) - 4);
  // 퇴근 layout: a price row's details card opens beside it, bottom-aligned with the row.
  // Measured on the row's slot, not the row itself, so dragging a row about never resizes the window.
  for (const item of document.querySelectorAll<HTMLElement>(".ticker:not(.in-panel) .ticker-item")) {
    top = Math.min(top, item.getBoundingClientRect().bottom - h);
  }
  return top;
}

/**
 * The window is docked full-width along the bottom of the screen (Rust: dock_bottom) and its
 * content is anchored to the bottom, so anything taller than the window pokes out of the top.
 * Measure that and ask Rust for the height that fits: grow at once, shrink after a short pause.
 */
export function useDockHeight() {
  useEffect(() => {
    if (!inTauri()) return;
    let busy = false;
    let shrinkSince = 0;

    const tick = async () => {
      if (busy) return;
      // a carried or flying Ticky keeps the window full height until it lands
      if (document.querySelector('.pet[data-held="1"], .pet[data-air="1"]')) { shrinkSince = 0; return; }
      let top = reservedTop();
      for (const el of document.querySelectorAll(CONTENT)) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) continue;
        top = Math.min(top, r.top);
      }
      if (!Number.isFinite(top)) return;
      const needH = Math.max(80, Math.ceil(window.innerHeight - top + MARGIN));
      const dh = needH - window.innerHeight;
      if (Math.abs(dh) <= 2) { shrinkSince = 0; return; }
      if (dh < 0) {
        if (!shrinkSince) { shrinkSince = Date.now(); return; }
        if (Date.now() - shrinkSince < SHRINK_MS) return;
      }
      shrinkSince = 0;
      busy = true;
      try { await invoke("dock_bottom", { height: needH }); } catch { /* leave it */ }
      busy = false;
    };

    const id = setInterval(tick, 150);
    return () => clearInterval(id);
  }, []);
}
