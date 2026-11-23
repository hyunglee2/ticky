import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { invoke } from "@tauri-apps/api/core";
import { inTauri } from "../clickThrough";
import { displayName, type WatchItem } from "../market/types";
import { EV, on, send, type Snapshot } from "../sync";
import { tickySvg, type Face } from "../ticky/art";
import { moodName, moodTone, pickFrom, TEASE_LINES, type MoodKey } from "../ticky/moods";
import { useWatchlist } from "../watchlist";

// 괴롭히기: one Ticky, big, in the middle of a transparent window over the whole screen.
// Three toys (buttons in the bar below, or keys 1 2 3):
//   - 뿅망치: click it for a bonk
//   - 화살:   pull back anywhere and let go (a slingshot), or just click a spot; a rubber
//             suction-cup arrow sticks where it hits. Click a stuck arrow to pop it off.
//   - 가위:   snip its wick; it grows back after a while
// Whatever the toy, grabbing the Ticky and dragging stretches it like jelly, and dragging it
// back and forth fast shakes it (dizzy; losses or gains fall out of it).
// It answers by how its stock is doing today: sorry on a down day, cheeky on an up day.
// The more it's teased, the further it goes: sulks, then cries, then begs to be forgiven.
// Esc, "그만할래", or (hammer / scissors) a click on the empty screen ends it; the Ticky goes
// back wearing a plaster.

type Tool = "hammer" | "arrow" | "scissors";

const STAGES = [0, 6, 14, 24]; // hits to reach: sulk, cry, "화 풀렸어?"
const stageOf = (hits: number) => STAGES.filter((n) => hits >= n).length - 1;

const FACE_MS = 750;      // a reaction face (ouch, stretch) before it goes back to its stage face
const SAY_MS = 1900;      // a bubble
const DRAG_PX = 10;       // moved this far while pressed: a drag, not a click
const SHAKE_TURNS = 3;    // this many direction changes…
const SHAKE_WINDOW = 800; // …within this long (ms) = shaking
const TURN_PX = 30;       // a direction change only counts after moving at least this far
const CHIP_EVERY = 90;    // ms between falling chips while shaking
const SHAKE_HIT_MS = 450; // shaking counts as one more hit this often
const LEAVE_MS = 360;
const ARROW_SPEED = 2200; // px/s
const MAX_ARROWS = 14;    // stuck at once (the oldest falls off)
const QUIVER = 5;         // this many stuck: "고슴도치 됐어"
const MARK_MS = 1600;     // the red ring a popped-off arrow leaves
const REGROW_MS = 3500;   // a snipped wick grows back after this long
const WICK_SLACK = 14;    // px around the wick that still counts as the wick

type Particle = { id: number; kind: "bonk" | "spark" | "chip" | "pop" | "wick"; x: number; y: number; text?: string; dx?: number; r?: number };
type Flying = { id: number; x: number; y: number; tx: number; ty: number; a: number; ms: number; hit: boolean };
type Stuck = { id: number; x: number; y: number; a: number };
type Mark = { id: number; x: number; y: number };

const INK = "#1f1f1f";
const HAMMER = `<svg viewBox="0 0 64 64" width="64" height="64" aria-hidden="true">
<g transform="rotate(-40 32 32)">
<rect x="29" y="30" width="6" height="30" rx="3" fill="#ffc83d" stroke="${INK}" stroke-width="2"/>
<rect x="12" y="13" width="40" height="19" rx="6" fill="#f04452" stroke="${INK}" stroke-width="2"/>
<path d="M22 14v17M28 14v17M34 14v17M40 14v17" stroke="#c9303d" stroke-width="2"/>
<rect x="7" y="11" width="8" height="23" rx="3" fill="#ffc83d" stroke="${INK}" stroke-width="2"/>
<rect x="49" y="11" width="8" height="23" rx="3" fill="#ffc83d" stroke="${INK}" stroke-width="2"/>
</g></svg>`;
// a rubber suction-cup arrow, pointing right; its cup's tip sits at the right edge
const ARROW = `<svg viewBox="0 0 76 18" width="76" height="18" aria-hidden="true">
<path d="M5 9H62" stroke="${INK}" stroke-width="5" stroke-linecap="round"/>
<path d="M5 9H62" stroke="#ffc83d" stroke-width="2.4" stroke-linecap="round"/>
<path d="M2 2.5l11 6.5-11 6.5 4-6.5z" fill="#3182f6" stroke="${INK}" stroke-width="1.4" stroke-linejoin="round"/>
<path d="M62 2c7.5 0 12 3 12 7s-4.5 7-12 7z" fill="#f04452" stroke="${INK}" stroke-width="1.6"/>
</svg>`;
// aiming: a little target sight
const SIGHT = `<svg viewBox="0 0 40 40" width="40" height="40" aria-hidden="true">
<circle cx="20" cy="20" r="12" fill="none" stroke="#f04452" stroke-width="3"/>
<circle cx="20" cy="20" r="3" fill="#f04452"/>
<path d="M20 2v8M20 30v8M2 20h8M30 20h8" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"/>
</svg>`;
// open safety scissors; the blades close on a snip (the tips sit at the top left)
const SCISSORS = `<svg viewBox="0 0 64 64" width="64" height="64" aria-hidden="true">
<g class="blade b1"><path d="M30 30L6 10l3-3 25 21z" fill="#e9ecef" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>
<circle cx="46" cy="46" r="9" fill="none" stroke="#3182f6" stroke-width="5"/><path d="M33 31l8 9" stroke="#3182f6" stroke-width="5" stroke-linecap="round"/></g>
<g class="blade b2"><path d="M30 30L10 6l-3 3 21 25z" fill="#f8f9fa" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>
<circle cx="50" cy="28" r="8" fill="none" stroke="#3182f6" stroke-width="5"/><path d="M32 32l11 -2" stroke="#3182f6" stroke-width="5" stroke-linecap="round"/></g>
<circle cx="31" cy="31" r="2.4" fill="${INK}"/>
</svg>`;
const WICK_BIT = `<svg viewBox="0 0 14 26" width="14" height="26" aria-hidden="true"><path d="M7 24c-3 -7 -1 -14 3 -21" fill="none" stroke="${INK}" stroke-width="3.4" stroke-linecap="round"/></svg>`;

const TOOLS: { id: Tool; label: string; key: string; hint: string; icon: string }[] = [
  { id: "hammer", label: "뿅망치", key: "1", hint: "클릭하면 뿅", icon: HAMMER },
  { id: "arrow", label: "화살", key: "2", hint: "당겼다 놓으면 발사 · 꽂힌 화살 클릭하면 뽁", icon: ARROW },
  { id: "scissors", label: "가위", key: "3", hint: "심지를 싹둑", icon: SCISSORS },
];
// where the cursor sits on each tool's drawing (px from its top left)
const HOT: Record<Tool, [number, number]> = { hammer: [18, 40], arrow: [20, 20], scissors: [8, 8] };

/** the first hit of a ray (from x,y going dx,dy, unit length) on a box, or null */
function rayBox(x: number, y: number, dx: number, dy: number, b: DOMRect): number | null {
  let lo = 0, hi = Infinity;
  for (const [p, d, min, max] of [[x, dx, b.left, b.right], [y, dy, b.top, b.bottom]] as const) {
    if (Math.abs(d) < 1e-9) { if (p < min || p > max) return null; continue; }
    let t1 = (min - p) / d, t2 = (max - p) / d;
    if (t1 > t2) [t1, t2] = [t2, t1];
    lo = Math.max(lo, t1);
    hi = Math.min(hi, t2);
    if (lo > hi) return null;
  }
  return lo;
}
const inside = (x: number, y: number, b: DOMRect, pad = 0) =>
  x >= b.left - pad && x <= b.right + pad && y >= b.top - pad && y <= b.bottom + pad;

export function Tease({ symbol, bridge, onDone }: { symbol: string; bridge?: Snapshot; onDone?: (hits: number) => void }) {
  const watch = useWatchlist();
  const [snap, setSnap] = useState<Snapshot | null>(bridge ?? null);
  useEffect(() => { if (bridge) setSnap(bridge); }, [bridge]);
  useEffect(() => {
    if (bridge) return;
    const off = on<Snapshot>(EV.snapshot, setSnap);
    send(EV.hello);
    return off;
  }, [bridge]);

  const quote = snap?.quotes[symbol];
  const baseMood: MoodKey = snap?.moods[symbol] ?? "calm";
  const tone = moodTone(baseMood, quote?.changePct ?? 0);
  const item: WatchItem = watch.entries.find((e) => e.symbol === symbol) ?? { symbol, name: symbol };
  const name = displayName(item, quote);

  const [tool, setTool] = useState<Tool>("hammer");
  const toolRef = useRef(tool);
  toolRef.current = tool;
  const [hits, setHits] = useState(0);
  const hitsRef = useRef(0);
  const stage = stageOf(hits);
  const [react, setReact] = useState<Face | undefined>();
  const [said, setSaid] = useState<{ text: string; id: number } | null>(null);
  const [parts, setParts] = useState<Particle[]>([]);
  const [bonk, setBonk] = useState<"a" | "b" | undefined>();
  const [leaving, setLeaving] = useState(false);
  const [shaking, setShaking] = useState(false);
  const [flying, setFlying] = useState<Flying[]>([]);
  const [stuck, setStuck] = useState<Stuck[]>([]);
  const [marks, setMarks] = useState<Mark[]>([]);
  const [aim, setAim] = useState<{ sx: number; sy: number; x: number; y: number } | null>(null);
  const [wick, setWick] = useState<"on" | "cut" | "regrow">("on");
  const wickRef = useRef(wick);
  wickRef.current = wick;

  // what it looks like: its mood with the face of the moment (stays a candle however far it goes)
  const mood: MoodKey = baseMood === "alarm" || baseMood === "shock" ? "sad" : baseMood;
  const stageFace: Face | undefined = stage === 1 ? "sulk" : stage >= 2 ? "beg" : tone === "up" ? "smug" : undefined;
  const face = shaking ? "dizzy" : react ?? stageFace;
  const svg = useMemo(
    () => tickySvg(mood, mood === "melt" ? "down" : tone, `${name} ${moodName(mood)}`, face),
    [mood, tone, name, face],
  );

  // ---- talking, faces, particles -------------------------------------------------------------
  const timers = useRef<number[]>([]);
  const later = (fn: () => void, ms: number) => { timers.current.push(window.setTimeout(fn, ms)); };
  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);
  const seq = useRef(0);
  const sayTimer = useRef(0);
  const lastLine = useRef("");
  const saidRef = useRef(said);
  saidRef.current = said;
  const say = (pool: string[]) => {
    const text = pickFrom(pool, lastLine.current);
    lastLine.current = text;
    const id = ++seq.current;
    setSaid({ text, id });
    window.clearTimeout(sayTimer.current);
    sayTimer.current = window.setTimeout(() => setSaid((s) => (s?.id === id ? null : s)), SAY_MS);
  };
  /** not every little thing gets words: a new stage always does, otherwise now and then */
  const maybeSay = (pool: string[], moved: boolean, chance = 0.5) => {
    if (moved || !saidRef.current || Math.random() < chance) say(pool);
  };
  const faceTimer = useRef(0);
  const flash = (f: Face, ms = FACE_MS) => {
    setReact(f);
    window.clearTimeout(faceTimer.current);
    faceTimer.current = window.setTimeout(() => setReact(undefined), ms);
  };
  const burst = (list: Omit<Particle, "id">[], life = 900) => {
    const made = list.map((p) => ({ ...p, id: ++seq.current }));
    setParts((ps) => [...ps, ...made]);
    later(() => setParts((ps) => ps.filter((p) => !made.includes(p))), life);
  };
  /** what it says once it's had enough (stage 1+), whatever the toy */
  const stageLines = (s: number) => (s === 1 ? TEASE_LINES.sulk : s === 2 ? TEASE_LINES.cry : TEASE_LINES.melt);
  const addHits = (n: number) => {
    const before = stageOf(hitsRef.current);
    hitsRef.current += n;
    setHits(hitsRef.current);
    const s = stageOf(hitsRef.current);
    return { stage: s, moved: s !== before };
  };

  // hello: pops in, says why it thinks it was called
  useEffect(() => { later(() => say(TEASE_LINES.start[tone]), 380); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- ending, keys -----------------------------------------------------------------------------
  const done = useRef(false);
  const finish = () => {
    if (done.current) return;
    done.current = true;
    setLeaving(true);
    window.setTimeout(() => {
      send(EV.teaseDone, { symbol, hits: hitsRef.current });
      onDone?.(hitsRef.current);
      if (inTauri()) invoke("close_tease").catch(() => {});
    }, LEAVE_MS);
  };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish();
      const t = TOOLS.find((x) => x.key === e.key);
      if (t) setTool(t.id);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- the cursor: the toy in hand follows the mouse ------------------------------------------
  const cursor = useRef<HTMLDivElement>(null);
  const mouse = useRef({ x: -200, y: -200 });
  const [overBar, setOverBar] = useState(false);
  const placeCursor = () => {
    const el = cursor.current;
    const [hx, hy] = HOT[toolRef.current];
    if (el) el.style.transform = `translate(${mouse.current.x - hx}px, ${mouse.current.y - hy}px)`;
  };
  useEffect(placeCursor, [tool]);
  const trackCursor = (e: React.PointerEvent) => {
    mouse.current = { x: e.clientX, y: e.clientY };
    placeCursor();
    const bar = !!(e.target as Element).closest?.(".tease-bar");
    if (bar !== overBar) setOverBar(bar);
  };
  const use = () => {
    const el = cursor.current;
    if (!el) return;
    el.removeAttribute("data-use");
    void el.offsetWidth; // restart the animation
    el.setAttribute("data-use", "1");
  };

  // ---- where things are --------------------------------------------------------------------------
  const body = useRef<HTMLDivElement>(null);
  const art = useRef<HTMLDivElement>(null);
  /** the candle itself (not the wick, feet or the empty room around it) */
  const bodyBox = () => {
    const shape = art.current?.querySelector(".upper > rect, .upper > path");
    return shape?.getBoundingClientRect() ?? art.current?.getBoundingClientRect() ?? null;
  };
  const wickBox = () => (wickRef.current === "on" ? art.current?.querySelector(".wick")?.getBoundingClientRect() ?? null : null);

  // ---- 뿅망치 -------------------------------------------------------------------------------------
  const bonkAt = (x: number, y: number) => {
    setBonk((b) => (b === "a" ? "b" : "a"));
    const { stage: s, moved } = addHits(1);
    flash(s >= 3 ? "beg" : "ouch");
    burst([
      { kind: "bonk", x, y, text: "뿅!" },
      ...[0, 1, 2, 3, 4].map((i) => ({ kind: "spark" as const, x, y, r: i * 72 + Math.random() * 30 })),
    ], 700);
    maybeSay(s === 0 ? TEASE_LINES.hit[tone] : stageLines(s), moved, 0.45);
  };

  // ---- 화살 ---------------------------------------------------------------------------------------
  /** fire from (x,y) in direction (dx,dy): sticks where it meets the candle, or flies past */
  const shoot = (x: number, y: number, dx: number, dy: number, reach?: number) => {
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len, uy = dy / len;
    const box = bodyBox();
    const t = box ? rayBox(x, y, ux, uy, box) : null;
    const hit = t !== null && (reach === undefined || t <= reach + 1);
    // a hit sinks in a little, so the cup sits on the candle even at its rounded corners
    const dist = hit ? t! + 6 : reach ?? Math.max(window.innerWidth, window.innerHeight) * 1.5;
    const a = Math.atan2(uy, ux) * 180 / Math.PI;
    const f: Flying = { id: ++seq.current, x, y, tx: x + ux * dist, ty: y + uy * dist, a, ms: Math.max(90, dist / ARROW_SPEED * 1000), hit };
    setFlying((fs) => [...fs, f]);
    later(() => {
      setFlying((fs) => fs.filter((g) => g.id !== f.id));
      if (f.hit) landArrow(f);
      else missed(f);
    }, f.ms);
  };
  const landArrow = (f: Flying) => {
    const b = body.current?.getBoundingClientRect();
    if (!b) return;
    // pinned to the Ticky (inside the part that stretches and shakes)
    const next: Stuck = { id: f.id, x: f.tx - b.left, y: f.ty - b.top, a: f.a };
    let count = 0;
    setStuck((ss) => { const all = [...ss, next].slice(-MAX_ARROWS); count = all.length; return all; });
    setBonk((k) => (k === "a" ? "b" : "a"));
    burst([{ kind: "pop", x: f.tx, y: f.ty, text: "뽁!" }], 700);
    const { stage: s, moved } = addHits(1);
    flash(s >= 3 ? "beg" : "ouch");
    // read the new count after the state update has run
    later(() => maybeSay(s > 0 ? stageLines(s) : count >= QUIVER ? TEASE_LINES.quiver : TEASE_LINES.arrowHit[tone], moved, 0.55), 0);
  };
  const missed = (f: Flying) => {
    // a click that lands next to it: a little plop where it fell
    if (f.ms < 900) burst([{ kind: "pop", x: f.tx, y: f.ty, text: "툭" }], 600);
    if (Math.random() < 0.7) say(TEASE_LINES.arrowMiss[tone]);
  };
  const unstick = (s: Stuck, e: React.PointerEvent) => {
    e.stopPropagation();
    setStuck((ss) => ss.filter((x) => x.id !== s.id));
    const mark = { id: s.id, x: s.x, y: s.y };
    setMarks((ms) => [...ms, mark]);
    later(() => setMarks((ms) => ms.filter((m) => m !== mark)), MARK_MS);
    burst([{ kind: "pop", x: e.clientX, y: e.clientY, text: "뽁" }], 600);
    if (Math.random() < 0.5) say(TEASE_LINES.unstick);
  };

  // ---- 가위 ---------------------------------------------------------------------------------------
  const snip = (x: number, y: number) => {
    const wb = wickBox();
    if (!wb || !inside(x, y, wb, WICK_SLACK)) {
      if (wickRef.current !== "on" && Math.random() < 0.6) say(TEASE_LINES.snipAgain);
      else if (Math.random() < 0.5) say(TEASE_LINES.snipMiss);
      return;
    }
    setWick("cut");
    burst([{ kind: "wick", x: wb.left + wb.width / 2, y: wb.top + wb.height / 2, dx: (Math.random() - 0.5) * 120, r: (Math.random() - 0.5) * 400 }], 1100);
    const { stage: s, moved } = addHits(2);
    flash("grab", 1300);
    say(s > 0 && moved ? stageLines(s) : TEASE_LINES.snip[tone]);
    later(() => {
      setWick("regrow");
      if (Math.random() < 0.6) say(TEASE_LINES.regrow);
      later(() => setWick("on"), 600);
    }, REGROW_MS);
  };

  // ---- grabbing the Ticky (any toy): stretch, shake; a plain click uses the toy ------------------
  const grip = useRef<{
    x: number; y: number; mode: "press" | "pull" | "shake"; k: number;
    dir: number; turnX: number; turns: number[]; lastChip: number; lastHit: number;
  } | null>(null);

  const setBody = (transform: string, springy = false) => {
    const el = body.current;
    if (!el) return;
    el.style.transition = springy ? "transform 0.55s cubic-bezier(0.25, 1.9, 0.45, 1)" : "none";
    el.style.transform = transform;
  };

  const down = (e: React.PointerEvent) => {
    if (e.button !== 0 || leaving) return;
    e.stopPropagation();
    use();
    // scissors on the wick: snip right away (no grabbing)
    if (toolRef.current === "scissors") {
      const wb = wickBox();
      if (wb && inside(e.clientX, e.clientY, wb, WICK_SLACK)) return snip(e.clientX, e.clientY);
    }
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    grip.current = { x: e.clientX, y: e.clientY, mode: "press", k: 0, dir: 0, turnX: e.clientX, turns: [], lastChip: 0, lastHit: 0 };
  };

  const move = (e: React.PointerEvent) => {
    trackCursor(e);
    if (aim) setAim({ ...aim, x: e.clientX, y: e.clientY });
    const g = grip.current;
    if (!g) return;
    const dx = e.clientX - g.x, dy = e.clientY - g.y;
    const dist = Math.hypot(dx, dy);
    if (g.mode === "press") {
      if (dist < DRAG_PX) return;
      g.mode = "pull";
      flash("stretch", 60_000); // held until let go
      if (stageOf(hitsRef.current) < 3) say(TEASE_LINES.stretch);
    }
    const now = performance.now();

    // back and forth fast = shaking
    const dir = Math.sign(e.movementX);
    if (dir && dir !== g.dir) {
      if (Math.abs(e.clientX - g.turnX) > TURN_PX) g.turns = [...g.turns.filter((t) => now - t < SHAKE_WINDOW), now];
      g.dir = dir;
      g.turnX = e.clientX;
    }
    if (g.mode === "pull" && g.turns.length >= SHAKE_TURNS) {
      g.mode = "shake";
      setShaking(true);
      say(TEASE_LINES.shake[tone]);
    }

    if (g.mode === "shake") {
      setBody(`translate(${dx}px, ${dy}px) rotate(${Math.max(-25, Math.min(25, e.movementX * 1.2))}deg)`);
      if (now - g.lastChip > CHIP_EVERY && tone !== "flat") {
        g.lastChip = now;
        burst([{ kind: "chip", x: e.clientX + (Math.random() - 0.5) * 80, y: e.clientY + 40, text: tone === "down" ? "−" : "+", dx: (Math.random() - 0.5) * 160, r: (Math.random() - 0.5) * 540 }], 1200);
      }
      if (now - g.lastHit > SHAKE_HIT_MS) {
        g.lastHit = now;
        const { stage: s, moved } = addHits(1);
        if (moved) say(stageLines(s));
      }
      return;
    }

    // stretching: pulled toward the mouse along the drag, thinner across it
    const k = Math.min(dist / 260, 0.85);
    g.k = k;
    const a = Math.atan2(dy, dx) * 180 / Math.PI;
    setBody(`translate(${dx * 0.28}px, ${dy * 0.28}px) rotate(${a}deg) scale(${1 + k}, ${1 / (1 + k * 0.6)}) rotate(${-a}deg)`);
  };

  const up = (e: React.PointerEvent) => {
    const g = grip.current;
    grip.current = null;
    if (!g) return;
    if (g.mode === "press") {
      // a plain click on the Ticky: whatever's in hand
      const t = toolRef.current;
      if (t === "hammer") return bonkAt(e.clientX, e.clientY);
      if (t === "arrow") return shootFromBelow(e.clientX, e.clientY);
      return snip(e.clientX, e.clientY);
    }
    // let go: snaps back
    setBody("", true);
    setShaking(false);
    if (g.mode === "shake") {
      flash("dizzy", 1500);
      return;
    }
    setReact(undefined);
    if (g.k > 0.3) {
      flash("ouch");
      const { stage: s } = addHits(2);
      say(s === 0 ? TEASE_LINES.snapBack : stageLines(s));
    }
  };

  /** a click (not a pull) with the bow: the arrow comes in from below, aimed at that spot */
  const shootFromBelow = (x: number, y: number) => {
    const sx = x + (x < window.innerWidth / 2 ? -1 : 1) * window.innerWidth * 0.25;
    const sy = window.innerHeight + 40;
    shoot(sx, sy, x - sx, y - sy, Math.hypot(x - sx, y - sy));
  };

  // ---- the empty screen: the bow's slingshot; with the others, a click there ends it ----------
  const downOutside = (e: React.PointerEvent) => {
    if (e.button !== 0 || leaving) return;
    if ((e.target as Element).closest?.(".tease-ticky, .tease-bar, .stuck-arrow")) return;
    if (toolRef.current !== "arrow") return finish();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    setAim({ sx: e.clientX, sy: e.clientY, x: e.clientX, y: e.clientY });
  };
  const upOutside = (e: React.PointerEvent) => {
    if (!aim) return;
    setAim(null);
    const dx = aim.sx - e.clientX, dy = aim.sy - e.clientY;
    use();
    if (Math.hypot(dx, dy) < DRAG_PX) return shootFromBelow(e.clientX, e.clientY);
    shoot(e.clientX, e.clientY, dx, dy);
  };

  const hand = tool === "hammer" ? HAMMER : tool === "scissors" ? SCISSORS : SIGHT;
  const pull = aim && Math.hypot(aim.sx - aim.x, aim.sy - aim.y) >= DRAG_PX ? aim : null;
  return (
    <div
      className="tease"
      data-leaving={leaving ? "1" : undefined}
      data-tool={tool}
      onPointerMove={move}
      onPointerDown={downOutside}
      onPointerUp={upOutside}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="tease-stage">
        <div className="tease-ticky" onPointerDown={down} onPointerUp={up} onPointerCancel={up}>
          <div className="tease-bubble-wrap">{said && <div key={said.id} className="bubble tease-bubble">{said.text}</div>}</div>
          <div ref={body} className="tease-body">
            <div ref={art} className="tease-art" data-bonk={bonk} data-wick={wick} dangerouslySetInnerHTML={{ __html: svg }} />
            {marks.map((m) => <span key={m.id} className="arrow-mark" style={{ left: m.x, top: m.y }} />)}
            {stuck.map((s) => (
              <span
                key={s.id}
                className="stuck-arrow"
                style={{ left: s.x, top: s.y, transform: `rotate(${s.a}deg)` }}
                onPointerDown={(e) => unstick(s, e)}
              ><span className="arrow-shape" dangerouslySetInnerHTML={{ __html: ARROW }} /></span>
            ))}
          </div>
        </div>
        <div className="tease-name">{name}</div>
      </div>

      {flying.map((f) => (
        <span
          key={f.id}
          className="flying-arrow"
          style={{ "--x": `${f.x}px`, "--y": `${f.y}px`, "--tx": `${f.tx}px`, "--ty": `${f.ty}px`, "--a": `${f.a}deg`, animationDuration: `${f.ms}ms` } as CSSProperties}
        ><span className="arrow-shape" dangerouslySetInnerHTML={{ __html: ARROW }} /></span>
      ))}

      {/* pulling back the bow: the band, and the arrow ready to fly the other way */}
      {pull && (
        <>
          <svg className="tease-band" aria-hidden="true">
            <line x1={pull.sx} y1={pull.sy} x2={pull.x} y2={pull.y} />
          </svg>
          <span
            className="aim-arrow"
            style={{ left: pull.x, top: pull.y, transform: `rotate(${Math.atan2(pull.sy - pull.y, pull.sx - pull.x) * 180 / Math.PI}deg)` }}
          ><span className="arrow-shape" dangerouslySetInnerHTML={{ __html: ARROW }} /></span>
        </>
      )}

      {parts.map((p) => (
        <span
          key={p.id}
          className={`tease-fx fx-${p.kind}${p.kind === "chip" ? ` ${tone}` : ""}`}
          style={{ left: p.x, top: p.y, "--dx": `${p.dx ?? 0}px`, "--r": `${p.r ?? 0}deg` } as CSSProperties}
          dangerouslySetInnerHTML={p.kind === "wick" ? { __html: WICK_BIT } : undefined}
        >{p.kind === "wick" ? undefined : p.text}</span>
      ))}

      <div className="tease-bar">
        <div className="tease-tools" role="group" aria-label="도구">
          {TOOLS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={t.id === tool ? "on" : ""}
              aria-pressed={t.id === tool}
              title={`${t.label} (${t.key})`}
              onClick={() => setTool(t.id)}
            >
              <span className={`tool-icon icon-${t.id}`} dangerouslySetInnerHTML={{ __html: t.icon }} />
              {t.label}
            </button>
          ))}
        </div>
        <span className="tease-hint">{TOOLS.find((t) => t.id === tool)!.hint} · 잡고 끌면 쭉</span>
        <button type="button" className="tease-stop" onClick={finish}>그만할래</button>
      </div>

      {!pull && (
        <div
          ref={cursor}
          className={`tease-hand hand-${tool}`}
          hidden={overBar}
          style={{ transform: "translate(-200px, -200px)" }}
          dangerouslySetInnerHTML={{ __html: hand }}
        />
      )}
    </div>
  );
}
