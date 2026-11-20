import { useEffect, useMemo, useRef, useState } from "react";
import { Pet } from "./components/Pet";
import { Toolbar } from "./components/Toolbar";
import { Onboarding } from "./components/Onboarding";
import { StatePreview } from "./components/StatePreview";
import { createHybridFeed } from "./market/hybridFeed";
import { isMarketOpen } from "./market/hours";
import { formatPrice, isKrx, type FeedStatus, type Quote } from "./market/types";
import { bandMood, pickLine, type MoodKey } from "./ticky/moods";
import { useDockHeight, useTextScale, useTickyScale } from "./scale";
import { useRoaming } from "./roam";
import { inTauri, useClickThroughRegions } from "./clickThrough";
import { useWatchlist } from "./watchlist";
import "./App.css";

// 놀람: a move of 2% or more within the last ~5 minutes, shown for 3 s
const SHOCK_PCT = 2, SHOCK_MS = 3000;
// 비상: siren + megaphone for 8 s, on any of
//   - a move of 3% or more within ~5 minutes (not again for 5 minutes)
//   - first crossing of ±10% for the day (entering 폭등 / 폭락)
//   - reaching the stock's target or stop price (once; re-arms after moving 0.5% back)
const ALARM_PCT = 3, ALARM_MS = 8000, JUMP_ALARM_GAP = 5 * 60_000, REARM = 0.005;

/** how many history points cover ~5 minutes: live KRX every 7 s, live US every 15 s, fake every 1.5 s */
const fiveMinTicks = (q: Quote) => (q.source === "live" ? (isKrx(q.symbol) ? 43 : 20) : 20);
const signed = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toFixed(2)}`;

// per-viewer conveniences; the app works the same if storage is unavailable
function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function save(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
}

interface PetState {
  band: MoodKey;
  mood: MoodKey;
  line: string;
  shockUntil: number;
  alarmUntil: number;
  jumpAlarmAt: number; // when the last 급변 alarm fired
  targetHit: boolean;  // already alarmed for the target / stop price (until it re-arms)
  stopHit: boolean;
}

const sameState = (a: PetState | undefined, b: PetState) =>
  !!a && a.band === b.band && a.mood === b.mood && a.line === b.line && a.shockUntil === b.shockUntil &&
  a.alarmUntil === b.alarmUntil && a.targetHit === b.targetHit && a.stopHit === b.stopHit;

export default function App() {
  const watch = useWatchlist();
  const [followHours, setFollowHours] = useState<boolean>(() => load("ticky.followHours", false));
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const [pets, setPets] = useState<Record<string, PetState>>({});
  const petsRef = useRef(pets);
  petsRef.current = pets;
  // live quotes need the Rust side, so only in the desktop app (not the browser preview)
  const liveEnabled = useMemo(() => inTauri(), []);
  const [status, setStatus] = useState<FeedStatus>({ us: "off", kr: "off", missing: [] });
  const feed = useMemo(() => createHybridFeed(liveEnabled), [liveEnabled]);

  // size setting scales only Tickies + bubbles; text follows Windows' text size
  const [scale, setScale] = useState<number>(() => load("ticky.scale", 1));
  useEffect(() => save("ticky.scale", scale), [scale]);
  useTickyScale(scale);
  useTextScale();
  useDockHeight();
  useClickThroughRegions();

  useEffect(() => save("ticky.followHours", followHours), [followHours]);
  // preview mode: show every state side by side (not saved; off on each launch)
  const [preview, setPreview] = useState(false);
  // only the stocks shown on screen are polled; keyed by symbols so a re-render doesn't resubscribe
  const shownKey = watch.shown.map((e) => e.symbol).join(",");
  const shown = useMemo(() => watch.shown, [shownKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    return feed.subscribe(shown, (q) => setQuotes((prev) => ({ ...prev, [q.symbol]: q })), setStatus);
  }, [feed, shown]);

  // a 1-second clock so timed states (놀람, 비상) end on time even between price updates
  const [clock, setClock] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setClock((c) => c + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // derive each Ticky's mood from its quote; pick a new line only when the mood changes
  useEffect(() => {
    const now = Date.now();
    const entries = Object.fromEntries(watch.entries.map((e) => [e.symbol, e]));
    const next: Record<string, PetState> = {};
    let changed = false;
    for (const { symbol } of shown) {
      const q = quotes[symbol];
      const old = petsRef.current[symbol];
      // 연결 끊김: the live source doesn't know this symbol, or that market's connection is failing
      const market = isKrx(symbol) ? status.kr : status.us;
      const liveDown = market === "rate-limit" || market === "error";
      if (liveEnabled && (status.missing.includes(symbol) || (liveDown && (!q || q.source === "live")))) {
        const line = old?.mood === "offline" ? old.line : pickLine("offline");
        next[symbol] = {
          band: old?.band ?? "calm", mood: "offline", line, shockUntil: 0, alarmUntil: 0,
          jumpAlarmAt: old?.jumpAlarmAt ?? 0, targetHit: old?.targetHit ?? false, stopHit: old?.stopHit ?? false,
        };
        if (!sameState(old, next[symbol])) changed = true;
        continue;
      }
      if (!q) continue;
      const entry = entries[symbol];
      const name = entry && entry.name !== symbol ? entry.name : q.name ?? symbol;
      const band = bandMood(q.changePct, old?.band);

      // movement over the last ~5 minutes
      const h = q.history;
      const n = fiveMinTicks(q);
      const recent = h.length > n ? h[h.length - 1 - n] : h[0];
      const move = (h[h.length - 1] / recent - 1) * 100;

      let shockUntil = old?.shockUntil ?? 0;
      if (Math.abs(move) >= SHOCK_PCT && now >= shockUntil + SHOCK_MS) shockUntil = now + SHOCK_MS;

      // 비상 triggers
      let alarmUntil = old?.alarmUntil ?? 0;
      let alarmText = "";
      let jumpAlarmAt = old?.jumpAlarmAt ?? 0;
      const fire = (text: string) => { alarmUntil = now + ALARM_MS; alarmText = text; };
      if (Math.abs(move) >= ALARM_PCT && now - jumpAlarmAt >= JUMP_ALARM_GAP) {
        jumpAlarmAt = now;
        fire(`비상! ${name} 5분 새 ${signed(move)}%`);
      }
      if (old && old.band !== band && (band === "boom" || band === "blast")) {
        fire(band === "boom" ? `비상! ${name} +10% 돌파` : `비상! ${name} −10% 붕괴`);
      }
      let targetHit = old?.targetHit ?? false;
      if (!entry?.target) targetHit = false;
      else if (!targetHit && q.price >= entry.target) {
        targetHit = true;
        fire(`비상! ${name} 목표가 ${formatPrice(symbol, entry.target)} 도달`);
      } else if (targetHit && q.price < entry.target * (1 - REARM)) targetHit = false;
      let stopHit = old?.stopHit ?? false;
      if (!entry?.stop) stopHit = false;
      else if (!stopHit && q.price <= entry.stop) {
        stopHit = true;
        fire(`비상! ${name} 손절가 ${formatPrice(symbol, entry.stop)} 도달`);
      } else if (stopHit && q.price > entry.stop * (1 + REARM)) stopHit = false;

      // live quotes know their session (pre-market and after-hours count as awake);
      // fake ones fall back to the exchange's regular hours
      const closed = q.session ? q.session === "closed" : !isMarketOpen(symbol);
      const mood: MoodKey =
        now < alarmUntil ? "alarm"
        : followHours && closed ? "sleep"
        : now < shockUntil ? "shock"
        : band;
      // a fresh alarm says exactly what happened; otherwise a new line only when the mood changes
      const line = alarmText || (old && old.mood === mood ? old.line : pickLine(mood));
      next[symbol] = { band, mood, line, shockUntil, alarmUntil, jumpAlarmAt, targetHit, stopHit };
      if (!sameState(old, next[symbol])) changed = true;
    }
    if (Object.keys(next).length !== Object.keys(petsRef.current).length) changed = true;
    if (changed) setPets(next);
  }, [quotes, shown, followHours, status, liveEnabled, watch.entries, clock]);

  // Tickies wander along the bottom of the screen at a pace set by their mood
  const moods = useMemo(
    () => Object.fromEntries(Object.entries(pets).map(([symbol, p]) => [symbol, p.mood])),
    [pets],
  );
  useRoaming(moods);

  return (
    <main className="desk">
      {!watch.ready && <Onboarding onPick={watch.start} />}
      {watch.ready && (
        <>
          <Toolbar
            watch={watch}
            followHours={followHours}
            onFollowHours={setFollowHours}
            scale={scale}
            onScale={setScale}
            preview={preview}
            onPreview={setPreview}
            status={status}
          />
          <div className="pets">
            {preview && <StatePreview />}
            {!preview && shown.map((item) => {
              const p = pets[item.symbol];
              return p ? (
                <Pet
                  key={item.symbol}
                  item={item}
                  quote={quotes[item.symbol]}
                  mood={p.mood}
                  line={p.line}
                  onRemove={() => watch.setShown(item.symbol, false)}
                />
              ) : null;
            })}
            {!preview && shown.length === 0 && (
              <p className="empty">＋ 를 눌러 목록에서 띄울 종목을 골라 보세요</p>
            )}
          </div>
        </>
      )}
    </main>
  );
}
