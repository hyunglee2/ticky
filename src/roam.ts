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
  // a real market spends most of the day in the quiet moods, so those still get a lively stroll
  boom: 85, cheer: 72, happy: 60, good: 52, calm: 44, sulky: 34, sad: 24,
  shock: 0, melt: 0, blast: 0, sleep: 0, offline: 0,
  alarm: 95, // scurries around sounding the alarm
};

const NIGHT_PACE = 0.5;    // a US Ticky resting in Korean daytime strolls at this share of its pace
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
// 출근 / 퇴근 (switching layouts). Each Ticky goes on its own, a beat apart: most say goodbye,
// and it vanishes in a puff of smoke. Coming in, each pops up out of a puff of smoke at its own
// spot across the screen, some say hello, and off they go.
// When everyone is out (or in), roam.ts fires "ticky:commute-done" on window.
const POOF_MS = 650; // the puff of smoke a leaving Ticky vanishes in
const TALK_CHANCE = 0.6;          // not everyone says something
const DRAG_SLOP = 4;      // px of movement before a press becomes a pick-up instead of a poke

// meeting another Ticky
const MEET_CHANCE = 0.6;
const MEET_COOLDOWN = 45_000; // per pair, whether or not they stopped to chat
const MEET_PAUSE = 3200;
const MEET_HOP_CHANCE = 0.12;
const IDLE_HOP_CHANCE = 0.1; // a little hop when it stops for a rest
const PASS_CHANCE = 0.7; // when they don't chat: walk past each other (else both turn around)

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
  | { kind: "meet"; other: MoodKey }
  | { kind: "leave"; talk: boolean }   // 퇴근: bows goodbye before walking off
  | { kind: "arrive"; talk: boolean }; // 출근: walked in, bows hello

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
  commute?: { kind: "in" | "out"; phase: "wait" | "poof" | "done"; until: number };
}

const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const tell = (el: Element, detail: TickyEvent) => el.dispatchEvent(new CustomEvent("ticky", { detail }));

/** A burst of little sparkles flying out from the Ticky as it pops up (출근). */
const SPARK_COLORS = ["#ffd43b", "#ff8fa6", "#74c0fc", "#b197fc", "#69db7c", "#ffa94d"];
function sparkle(el: HTMLElement) {
  const host = el; // on the Ticky itself, not its body (which shrinks away when it vanishes)
  const n = 12;
  for (let i = 0; i < n; i++) {
    const p = document.createElement("span");
    const a = (i / n) * Math.PI * 2 + rand(-0.25, 0.25);
    const d = rand(34, 62);
    p.className = Math.random() < 0.5 ? "spark-p star" : "spark-p";
    p.style.setProperty("--dx", `${Math.cos(a) * d}px`);
    p.style.setProperty("--dy", `${Math.sin(a) * d * 0.8 - 10}px`);
    p.style.setProperty("--c", SPARK_COLORS[i % SPARK_COLORS.length]);
    p.style.animationDelay = `${rand(0, 80)}ms`;
    host.appendChild(p);
    setTimeout(() => p.remove(), 900);
  }
}

/** Anyone being carried or flying? (the window keeps its full height and catches the mouse meanwhile) */
export const isGrabbing = () => !!document.querySelector('.pet[data-held="1"], .pet[data-air="1"]');

export function useRoaming(moods: Record<string, MoodKey>) {
  const moodsRef = useRef(moods);
  moodsRef.current = moods;

  useEffect(() => {
    const walkers = new Map<string, Walker>();
    const metAt = new Map<string, number>();
    const bumps = new Map<string, "meet" | "pass" | "turn">(); // what two touching Tickies decided
    let last = performance.now();
    let raf = 0;
    let commuteDone = false;
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
      let arrivals = 0; // Tickies appearing together get their own stretch of the screen each
      const arriving = document.querySelectorAll('.pet[data-commute="in"]').length;
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

        // 출근 / 퇴근 (App sets data-commute while the layout switches)
        const commute = el.dataset.commute as "in" | "out" | undefined;
        if (!commute && w.commute) delete w.commute;
        if (commute && w.mode === "ground") {
          if (w.commute?.kind !== commute) {
            w.rightAt = 0;
            w.angle = w.y = 0;
            w.walking = false;
            if (commute === "out") {
              // nearest the exit goes first, a little apart from each other
              const delay = (1 - w.x / window.innerWidth) * 600 + rand(0, 600);
              w.commute = { kind: "out", phase: "wait", until: now + delay };
            } else {
              delete el.dataset.poof; // (came back before the layout finished switching)
              // pops up out of a puff of smoke at its own spot across the screen, at its own moment
              const slot = arrivals++;
              w.x = clamp(EDGE + (maxX - EDGE) * ((slot + rand(0.15, 0.85)) / Math.max(1, arriving)), EDGE, maxX);
              w.dir = Math.random() < 0.5 ? -1 : 1;
              delete el.dataset.shown; // stays hidden until its puff (App.css)
              w.commute = { kind: "in", phase: "wait", until: now + rand(0, 900) };
            }
          }
          const c = w.commute!;
          if (c.kind === "out") {
            if (c.phase === "wait" && now >= c.until) {
              // says goodbye (maybe) and vanishes in a puff of smoke (App.css: data-poof)
              tell(el, { kind: "leave", talk: Math.random() < TALK_CHANCE });
              c.phase = "poof";
              c.until = now + POOF_MS;
              el.dataset.poof = "1";
            } else if (c.phase === "poof" && now >= c.until) {
              c.phase = "done";
            }
          } else {
            if (c.phase === "wait" && now >= c.until) {
              // poof: shows up with a puff of smoke (App.css: data-appear); some say hello
              el.dataset.shown = "1";
              el.dataset.appear = "1";
              sparkle(el);
              setTimeout(() => delete el.dataset.appear, POOF_MS + 50);
              if (Math.random() < 0.8) tell(el, { kind: "arrive", talk: true });
              c.phase = "poof";
              c.until = now + POOF_MS;
            } else if (c.phase === "poof" && now >= c.until) {
              // and off it goes, wandering as usual
              c.phase = "done";
              w.until = now + rand(600, 1800);
            }
          }
          el.dataset.righting = "0";
          // arrived and wandering off: from here the usual walking below takes over
          if (!(c.kind === "in" && c.phase === "done")) {
            placed.push({ el, w, width, symbol });
            continue;
          }
        }

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
          // small Tickies walk a bit slower, but not in proportion (or "작게" looks sluggish)
          const speed = SPEED[moodsRef.current[symbol] ?? "calm"] * Math.sqrt(scale) * (el.dataset.night ? NIGHT_PACE : 1);
          const held = speed === 0 || stay || dizzy || !!w.rightAt || el.matches(":hover");
          if (held) {
            w.walking = false;
          } else if (now >= w.until) {
            w.walking = !w.walking;
            w.until = now + (w.walking ? rand(2500, 6000) : rand(600, 2200)); // short rests: lively
            if (w.walking && Math.random() < 0.4) w.dir = w.dir === 1 ? -1 : 1;
            // stopping now and then with a little hop, or a look the other way
            if (!w.walking) {
              const r = Math.random();
              if (r < IDLE_HOP_CHANCE) el.dataset.hop = el.dataset.hop === "a" ? "b" : "a";
              else if (r < IDLE_HOP_CHANCE + 0.25) setTimeout(() => { if (!w.walking) w.dir = w.dir === 1 ? -1 : 1; }, rand(300, 900));
            }
          }
          if (w.walking) w.x += w.dir * speed * dt;
          if (w.x <= EDGE) { w.x = EDGE; w.dir = 1; }
          if (w.x >= maxX) { w.x = maxX; w.dir = -1; }
          el.dataset.dizzy = dizzy ? "1" : "0";
        }
        placed.push({ el, w, width, symbol });
      }

      // 출근 / 퇴근 finished for everyone? tell App once
      const commuters = placed.filter((p) => p.w.commute);
      if (!commuters.length) commuteDone = false;
      else if (!commuteDone && commuters.every((p) => p.w.commute!.phase === "done")) {
        commuteDone = true;
        window.dispatchEvent(new Event("ticky:commute-done"));
      }

      // Tickies on the ground walking into each other: now and then they stop and chat; otherwise
      // usually one just walks past the other (in front of it), and sometimes both turn around.
      // Decided once per bump and kept until they're apart again.
      const grounded = placed.filter((p) => p.w.mode === "ground" && !p.w.commute).sort((a, b) => a.w.x - b.w.x);
      const touching = new Set<string>();
      for (let i = 0; i + 1 < grounded.length; i++) {
        const a = grounded[i], b = grounded[i + 1];
        if (b.w.x - a.w.x >= a.width * 0.75) continue;
        const pair = a.symbol < b.symbol ? `${a.symbol}|${b.symbol}` : `${b.symbol}|${a.symbol}`;
        touching.add(pair);
        if (bumps.get(pair) === "pass") continue; // already walking past each other
        const closing = (a.w.walking && a.w.dir === 1) || (b.w.walking && b.w.dir === -1);
        if (!closing) continue;
        if (!bumps.has(pair)) {
          if (now - (metAt.get(pair) ?? -Infinity) >= MEET_COOLDOWN && Math.random() < MEET_CHANCE) {
            metAt.set(pair, now);
            bumps.set(pair, "meet");
            for (const p of [a, b]) { p.w.walking = false; p.w.until = now + MEET_PAUSE; }
            a.w.dir = 1;  // face each other
            b.w.dir = -1;
            // only now and then do they hop for joy; usually they just stop and talk
            if (Math.random() < MEET_HOP_CHANCE) for (const p of [a, b]) p.el.dataset.hop = p.el.dataset.hop === "a" ? "b" : "a";
            tell(a.el, { kind: "meet", other: moodsRef.current[b.symbol] ?? "calm" });
            setTimeout(() => tell(b.el, { kind: "meet", other: moodsRef.current[a.symbol] ?? "calm" }), 900);
            continue;
          }
          if (Math.random() < PASS_CHANCE) {
            bumps.set(pair, "pass");
            // the one on the move goes in front
            const mover = a.w.walking && a.w.dir === 1 ? a : b;
            mover.el.style.zIndex = "3";
            continue;
          }
          bumps.set(pair, "turn");
        }
        if (bumps.get(pair) === "meet") continue;
        if (a.w.walking && a.w.dir === 1) a.w.dir = -1;
        if (b.w.walking && b.w.dir === -1) b.w.dir = 1;
      }
      // apart again: forget the decision (and put a passer back at normal depth)
      for (const pair of [...bumps.keys()]) {
        if (touching.has(pair)) continue;
        bumps.delete(pair);
        for (const sym of pair.split("|")) {
          const p = placed.find((q) => q.symbol === sym);
          if (p && ![...bumps.entries()].some(([k, v]) => v === "pass" && k.split("|").includes(sym))) p.el.style.zIndex = "";
        }
      }

      for (const { el, w } of placed) {
        // match the stepping to the ground speed: quicker, longer steps when excited,
        // slow short shuffles when sad. The planted foot travels a full stride per half cycle.
        const base = SPEED[moodsRef.current[el.dataset.symbol!] ?? "calm"] * (el.dataset.night ? NIGHT_PACE : 1);
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
