// Tickies wander along the bottom of the screen: walk a while, rest a while, turn around.
// Mood sets the pace (excited ones scurry, sad ones shuffle, melted/asleep ones stay put).
// Hovering a Ticky stops it so its card can be read. Positions are written straight to the DOM
// every frame (transform + data attributes) so walking doesn't re-render React.
import { useEffect, useRef } from "react";
import type { MoodKey } from "./ticky/moods";

/** walking speed in px per second at the normal size */
const SPEED: Record<MoodKey, number> = {
  boom: 75, cheer: 60, happy: 42, good: 32, calm: 22, sulky: 14, sad: 9,
  shock: 0, melt: 0, blast: 0, sleep: 0, offline: 0,
};

const EDGE = 16;          // keep clear of the screen edges (room for the hover card too)
const UNITS_TO_PX = 88 / 120; // the Ticky's SVG is 120 units wide, drawn 88px wide at normal size
const TOOLBAR_GAP = 12;   // and of the toolbar in the bottom-right corner

interface Walker {
  x: number;            // left edge, px from the window's left
  dir: 1 | -1;
  walking: boolean;
  until: number;        // when the current walk / rest ends (performance.now ms)
}

const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo);

export function useRoaming(moods: Record<string, MoodKey>) {
  const moodsRef = useRef(moods);
  moodsRef.current = moods;

  useEffect(() => {
    const walkers = new Map<string, Walker>();
    let last = performance.now();
    let raf = 0;

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000); // seconds; capped so a hidden tab doesn't teleport
      last = now;
      const toolbar = document.querySelector<HTMLElement>(".toolbar");
      const rightLimit = window.innerWidth - EDGE - (toolbar ? toolbar.offsetWidth + TOOLBAR_GAP : 0);
      const scale = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--s")) || 1;

      const placed: { el: HTMLElement; w: Walker; width: number }[] = [];
      for (const el of document.querySelectorAll<HTMLElement>(".pet[data-symbol]")) {
        const symbol = el.dataset.symbol!;
        const width = el.offsetWidth;
        const maxX = Math.max(EDGE, rightLimit - width);
        let w = walkers.get(symbol);
        if (!w) {
          // newcomers drop in somewhere random and rest a moment first
          w = { x: rand(EDGE, maxX), dir: Math.random() < 0.5 ? -1 : 1, walking: false, until: now + rand(300, 2500) };
          walkers.set(symbol, w);
        }
        const speed = SPEED[moodsRef.current[symbol] ?? "calm"] * scale;
        const held = speed === 0 || el.matches(":hover");
        if (held) {
          w.walking = false;
        } else if (now >= w.until) {
          w.walking = !w.walking;
          w.until = now + (w.walking ? rand(2500, 7000) : rand(1500, 5000));
          if (w.walking && Math.random() < 0.4) w.dir = w.dir === 1 ? -1 : 1;
        }
        if (w.walking) w.x += w.dir * speed * dt;
        if (w.x <= EDGE) { w.x = EDGE; w.dir = 1; }
        if (w.x >= maxX) { w.x = maxX; w.dir = -1; }
        placed.push({ el, w, width });
      }

      // personal space: two Tickies bumping into each other both turn around
      placed.sort((a, b) => a.w.x - b.w.x);
      for (let i = 0; i + 1 < placed.length; i++) {
        const a = placed[i], b = placed[i + 1];
        if (b.w.x - a.w.x < a.width * 0.75) {
          if (a.w.walking && a.w.dir === 1) a.w.dir = -1;
          if (b.w.walking && b.w.dir === -1) b.w.dir = 1;
        }
      }

      for (const { el, w } of placed) {
        // match the stepping to the ground speed: quicker, longer steps when excited,
        // slow short shuffles when sad. The planted foot travels a full stride per half cycle.
        const base = SPEED[moodsRef.current[el.dataset.symbol!] ?? "calm"];
        if (base > 0) {
          const step = Math.min(0.8, Math.max(0.25, 0.45 * Math.sqrt(22 / base)));
          const stride = (base * step) / 2 / UNITS_TO_PX; // in SVG units at normal size
          el.style.setProperty("--step", `${step.toFixed(3)}s`);
          el.style.setProperty("--half", `${(stride / 2).toFixed(2)}px`);
        }
        el.style.transform = `translateX(${Math.round(w.x)}px)`;
        el.dataset.walking = w.walking ? "1" : "0";
        el.dataset.dir = w.dir === 1 ? "right" : "left";
      }
      raf = requestAnimationFrame(frame);
    };

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);
}
