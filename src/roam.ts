// Tickies live along the bottom of the screen like desktop pets:
//   - they wander: walk a while, rest a while, turn around. Mood sets the pace (excited ones
//     scurry, sad ones shuffle, melted/asleep ones stay put). Hovering stops one so its card can be read.
//   - they can be picked up (drag), dangled, and thrown: gravity, bounces off the screen edges,
//     a hard landing leaves them dizzy for a moment.
//   - a click is a poke; two Tickies walking into each other sometimes stop and chat.
// Positions are written straight to the DOM every frame (transform + data attributes) so moving
// doesn't re-render React. Reactions that need words go to the Pet as a "ticky" DOM event.
import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { MoodKey } from "./ticky/moods";
import { inTauri } from "./clickThrough";

/** walking speed in px per second at the normal size */
const SPEED: Record<MoodKey, number> = {
  boom: 75, cheer: 60, happy: 42, good: 32, calm: 22, sulky: 14, sad: 9,
  shock: 0, melt: 0, blast: 0, sleep: 0, offline: 0,
  alarm: 95, // scurries around sounding the alarm
};

const EDGE = 16;          // keep clear of the screen edges (room for the hover card too)
const UNITS_TO_PX = 88 / 120; // the Ticky's SVG is 120 units wide, drawn 88px wide at normal size
const TOOLBAR_GAP = 12;   // and of the toolbar in the bottom-right corner

// throwing
const GRAVITY = 2600;     // px/s²
const BOUNCE = 0.42;      // how much upward speed survives hitting the ground
const WALL_BOUNCE = 0.55; // and sideways speed hitting a screen edge
const MAX_THROW = 3200;   // px/s
// how it takes the landing: pure chance, not how hard it was thrown (nothing for the user to
// figure out — every landing is a little surprise). Shares add up to 1.
const LAND_ODDS = { crash: 0.1, huff: 0.15, shy: 0.2, fun: 0.3, relief: 0.25 };
const DIZZY_MS = 2600;
const RIGHT_PAUSE = 220; // ms lying tilted after landing before it gets up
const RIGHT_MS = 300;     // ms to stand up
const DRAG_SLOP = 4;      // px of movement before a press becomes a pick-up instead of a poke

// meeting another Ticky
const MEET_CHANCE = 0.6;
const MEET_COOLDOWN = 45_000; // per pair, whether or not they stopped to chat
const MEET_PAUSE = 3200;

/** What the Pet component hears about (see Pet.tsx) */
export type TickyEvent =
  | { kind: "grab" }
  | { kind: "throw"; speed: number } // let go (speed in px/s; small = just dropped)
  | { kind: "land" }
  | { kind: "crash" }
  | { kind: "huff" }
  | { kind: "shy" }
  | { kind: "fun" }
  | { kind: "poke" }
  | { kind: "meet"; other: MoodKey };

interface Walker {
  x: number;            // left edge, px from the window's left
  y: number;            // height above the ground, px
  vx: number;           // px/s while flying
  vy: number;           // px/s, up is positive
  mode: "ground" | "held" | "air";
  angle: number;        // tilt in degrees (dangling, tumbling through the air)
  rightFrom: number;    // after landing: the tilt it lay at, and when it starts getting up
  rightAt: number;      //   (0 = standing)
  dir: 1 | -1;
  walking: boolean;
  until: number;        // when the current walk / rest ends (performance.now ms)
  dizzyUntil: number;
}

const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const tell = (el: Element, detail: TickyEvent) => el.dispatchEvent(new CustomEvent("ticky", { detail }));

/** Anyone being carried or flying? (the window keeps its full height and catches the mouse meanwhile) */
export const isGrabbing = () => !!document.querySelector('.pet[data-held="1"], .pet[data-air="1"]');

export function useRoaming(moods: Record<string, MoodKey>) {
  const moodsRef = useRef(moods);
  moodsRef.current = moods;

  useEffect(() => {
    const walkers = new Map<string, Walker>();
    const metAt = new Map<string, number>();
    let last = performance.now();
    let raf = 0;
    let bounds = { minX: EDGE, maxX: 600, maxY: 400 }; // updated every frame, per Ticky width

    // ---- pick up / throw / poke -------------------------------------------------------------
    // Screen coordinates, not client ones: the window grows taller mid-drag, which moves client y.
    let press: {
      el: HTMLElement; w: Walker; id: number; sx: number; sy: number; x0: number; y0: number;
      dragging: boolean; samples: { t: number; x: number; y: number }[];
    } | null = null;

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      const target = e.target as HTMLElement;
      if (target.closest("button, .menu, .card")) return;
      const el = target.closest<HTMLElement>(".pet[data-symbol]");
      if (!el) return;
      const w = el.dataset.pinned ? undefined : walkers.get(el.dataset.symbol!);
      if (!w) { // preview lineup: pokes only
        press = null;
        tell(el, { kind: "poke" });
        return;
      }
      e.preventDefault();
      try { el.setPointerCapture(e.pointerId); } catch { /* not a live pointer; window listeners still follow it */ }
      press = { el, w, id: e.pointerId, sx: e.screenX, sy: e.screenY, x0: w.x, y0: w.y, dragging: false, samples: [] };
    };

    const onMove = (e: PointerEvent) => {
      if (!press || e.pointerId !== press.id) return;
      const dx = e.screenX - press.sx, dy = e.screenY - press.sy;
      if (!press.dragging) {
        if (Math.hypot(dx, dy) < DRAG_SLOP) return;
        press.dragging = true;
        press.w.mode = "held";
        press.w.rightAt = 0;
        press.w.walking = false;
        press.el.dataset.held = "1";
        // the hop animation shares the body with the wriggle: clear it so the wriggle shows
        delete press.el.dataset.hop;
        tell(press.el, { kind: "grab" });
        // room to lift it: the window takes the full screen height until it lands
        if (inTauri()) invoke("dock_bottom", { height: window.screen.availHeight }).catch(() => {});
        window.dispatchEvent(new Event("ticky:regions"));
      }
      const w = press.w;
      const nx = clamp(press.x0 + dx, bounds.minX, bounds.maxX);
      const ny = clamp(press.y0 - dy, 0, bounds.maxY);
      // dangle: lean against the direction it's being dragged
      w.angle = clamp(w.angle * 0.8 - (nx - w.x) * 0.9, -28, 28);
      w.x = nx;
      w.y = ny;
      const t = performance.now();
      press.samples.push({ t, x: e.screenX, y: e.screenY });
      while (press.samples.length > 2 && t - press.samples[0].t > 90) press.samples.shift();
    };

    const onUp = (e: PointerEvent) => {
      if (!press || e.pointerId !== press.id) return;
      const { el, w, dragging, samples } = press;
      press = null;
      if (!dragging) {
        tell(el, { kind: "poke" });
        return;
      }
      // throw with the speed of the last ~90 ms of the drag
      const a = samples[0], b = samples[samples.length - 1];
      const dt = a && b && b.t > a.t ? (b.t - a.t) / 1000 : 0;
      w.vx = dt ? clamp((b.x - a.x) / dt, -MAX_THROW, MAX_THROW) : 0;
      w.vy = dt ? clamp(-(b.y - a.y) / dt, -MAX_THROW, MAX_THROW) : 0;
      w.mode = "air";
      delete el.dataset.held;
      el.dataset.air = "1";
      tell(el, { kind: "throw", speed: Math.hypot(w.vx, w.vy) });
    };

    window.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);

    // ---- every frame --------------------------------------------------------------------------
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000); // seconds; capped so a hidden tab doesn't teleport
      last = now;
      const toolbar = document.querySelector<HTMLElement>(".toolbar");
      const rightLimit = window.innerWidth - EDGE - (toolbar ? toolbar.offsetWidth + TOOLBAR_GAP : 0);
      const scale = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--s")) || 1;

      const placed: { el: HTMLElement; w: Walker; width: number; symbol: string }[] = [];
      for (const el of document.querySelectorAll<HTMLElement>(".pet[data-symbol]:not([data-pinned])")) {
        const symbol = el.dataset.symbol!;
        const width = el.offsetWidth;
        const maxX = Math.max(EDGE, rightLimit - width);
        const maxY = Math.max(0, window.screen.availHeight - el.offsetHeight - 40);
        let w = walkers.get(symbol);
        if (!w) {
          // newcomers drop in somewhere random and rest a moment first
          w = {
            x: rand(EDGE, maxX), y: 0, vx: 0, vy: 0, mode: "ground", angle: 0, rightFrom: 0, rightAt: 0,
            dir: Math.random() < 0.5 ? -1 : 1, walking: false, until: now + rand(300, 2500), dizzyUntil: 0,
          };
          walkers.set(symbol, w);
        }
        if (press?.w === w) bounds = { minX: EDGE, maxX, maxY };

        if (w.mode === "held") {
          w.angle *= 0.9; // swings back to hanging straight when the hand stops
        } else if (w.mode === "air") {
          w.vy -= GRAVITY * dt;
          w.x += w.vx * dt;
          w.y += w.vy * dt;
          // a hard sideways throw spins it head over heels; a gentle one just tilts
          w.angle = clamp(w.angle + w.vx * dt * 0.25, -40, 40);
          if (w.x < EDGE) { w.x = EDGE; w.vx = -w.vx * WALL_BOUNCE; }
          if (w.x > maxX) { w.x = maxX; w.vx = -w.vx * WALL_BOUNCE; }
          if (w.y > maxY) { w.y = maxY; w.vy = -Math.abs(w.vy) * WALL_BOUNCE; }
          if (w.y <= 0) {
            w.y = 0;
            const impact = -w.vy;
            w.vy = impact * BOUNCE;
            w.vx *= 0.7;
            if (w.vy < 140) {
              // settled
              w.mode = "ground";
              w.vx = w.vy = 0;
              // lies where it fell for a beat, then gets up (see below)
              if (Math.abs(w.angle) > 2) { w.rightFrom = w.angle; w.rightAt = now + RIGHT_PAUSE; }
              else w.angle = 0;
              delete el.dataset.air;
              let roll = Math.random();
              const pick = (share: number) => (roll -= share) < 0;
              const crashed = pick(LAND_ODDS.crash);
              const huff = !crashed && pick(LAND_ODDS.huff);
              const shy = !crashed && !huff && pick(LAND_ODDS.shy);
              const fun = !crashed && !huff && !shy && pick(LAND_ODDS.fun);
              if (crashed) w.dizzyUntil = now + DIZZY_MS;
              // 흥: turns its back on you, a beat after landing
              if (huff) setTimeout(() => { w.dir = w.dir === 1 ? -1 : 1; }, 450);
              w.walking = false;
              w.until = now + (crashed ? DIZZY_MS : huff ? 1600 : 0) + rand(600, 1800);
              if (fun) el.dataset.hop = el.dataset.hop === "a" ? "b" : "a"; // hops for joy
              tell(el, { kind: crashed ? "crash" : huff ? "huff" : shy ? "shy" : fun ? "fun" : "land" });
            }
          }
        } else {
          // getting up after a landing: a short pause, then one smooth push upright with a small hop
          if (w.rightAt) {
            const t = (now - w.rightAt) / RIGHT_MS;
            if (t >= 1) {
              w.angle = w.y = 0;
              w.rightAt = 0;
            } else if (t > 0) {
              const ease = 1 - Math.pow(1 - t, 3);
              w.angle = w.rightFrom * (1 - ease);
              w.y = Math.sin(Math.PI * t) * 5;
            }
          }
          el.dataset.righting = w.rightAt ? "1" : "0";
          const stay = el.dataset.stay === "1";
          const dizzy = now < w.dizzyUntil;
          const speed = SPEED[moodsRef.current[symbol] ?? "calm"] * scale;
          const held = speed === 0 || stay || dizzy || !!w.rightAt || el.matches(":hover");
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
          el.dataset.dizzy = dizzy ? "1" : "0";
        }
        placed.push({ el, w, width, symbol });
      }

      // personal space: Tickies on the ground walking into each other either stop and chat
      // (now and then) or both turn around
      const grounded = placed.filter((p) => p.w.mode === "ground").sort((a, b) => a.w.x - b.w.x);
      for (let i = 0; i + 1 < grounded.length; i++) {
        const a = grounded[i], b = grounded[i + 1];
        if (b.w.x - a.w.x >= a.width * 0.75) continue;
        const closing = (a.w.walking && a.w.dir === 1) || (b.w.walking && b.w.dir === -1);
        if (!closing) continue;
        const pair = a.symbol < b.symbol ? `${a.symbol}|${b.symbol}` : `${b.symbol}|${a.symbol}`;
        if (now - (metAt.get(pair) ?? -Infinity) >= MEET_COOLDOWN) {
          metAt.set(pair, now);
          if (Math.random() < MEET_CHANCE) {
            for (const p of [a, b]) { p.w.walking = false; p.w.until = now + MEET_PAUSE; }
            a.w.dir = 1;  // face each other
            b.w.dir = -1;
            for (const p of [a, b]) {
              p.el.dataset.hop = p.el.dataset.hop === "a" ? "b" : "a";
            }
            tell(a.el, { kind: "meet", other: moodsRef.current[b.symbol] ?? "calm" });
            setTimeout(() => tell(b.el, { kind: "meet", other: moodsRef.current[a.symbol] ?? "calm" }), 900);
            continue;
          }
        }
        if (a.w.walking && a.w.dir === 1) a.w.dir = -1;
        if (b.w.walking && b.w.dir === -1) b.w.dir = 1;
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
        const lift = w.y ? ` translateY(${-Math.round(w.y)}px)` : "";
        const tilt = Math.abs(w.angle) > 0.5 ? ` rotate(${w.angle.toFixed(1)}deg)` : "";
        el.style.transform = `translateX(${Math.round(w.x)}px)${lift}${tilt}`;
        el.dataset.walking = w.walking ? "1" : "0";
        el.dataset.dir = w.dir === 1 ? "right" : "left";
      }
      raf = requestAnimationFrame(frame);
    };

    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, []);
}
