import { useEffect, useMemo, useRef, useState } from "react";
import { Pet } from "./components/Pet";
import { Toolbar } from "./components/Toolbar";
import { Onboarding } from "./components/Onboarding";
import { createHybridFeed } from "./market/hybridFeed";
import { isMarketOpen } from "./market/hours";
import { isKrx, type FeedStatus, type Quote } from "./market/types";
import { bandMood, pickLine, type MoodKey } from "./ticky/moods";
import { useAutoWindowSize, useTextScale, useTickyScale } from "./scale";
import { inTauri, useClickThroughRegions } from "./clickThrough";
import { useWatchlist } from "./watchlist";
import "./App.css";

// 놀람: a jump of 2% or more within the last 20 ticks (~30 s fake, ~5 min live), shown for 3 s
const SHOCK_WINDOW = 20, SHOCK_PCT = 2, SHOCK_MS = 3000;

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

interface PetState { band: MoodKey; mood: MoodKey; line: string; shockUntil: number }

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
  useAutoWindowSize();
  useClickThroughRegions();

  useEffect(() => save("ticky.followHours", followHours), [followHours]);

  // only the stocks shown on screen are polled; keyed by symbols so a re-render doesn't resubscribe
  const shownKey = watch.shown.map((e) => e.symbol).join(",");
  const shown = useMemo(() => watch.shown, [shownKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    return feed.subscribe(shown, (q) => setQuotes((prev) => ({ ...prev, [q.symbol]: q })), setStatus);
  }, [feed, shown]);

  // derive each Ticky's mood from its quote; pick a new line only when the mood changes
  useEffect(() => {
    const now = Date.now();
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
        next[symbol] = { band: old?.band ?? "calm", mood: "offline", line, shockUntil: 0 };
        if (old?.mood !== "offline") changed = true;
        continue;
      }
      if (!q) continue;
      const band = bandMood(q.changePct, old?.band);
      const h = q.history;
      const recent = h.length > SHOCK_WINDOW ? h[h.length - 1 - SHOCK_WINDOW] : h[0];
      const jumped = Math.abs((h[h.length - 1] / recent - 1) * 100) >= SHOCK_PCT;
      let shockUntil = old?.shockUntil ?? 0;
      if (jumped && now >= shockUntil + SHOCK_MS) shockUntil = now + SHOCK_MS;
      // live quotes know their session (pre-market and after-hours count as awake);
      // fake ones fall back to the exchange's regular hours
      const closed = q.session ? q.session === "closed" : !isMarketOpen(symbol);
      const mood: MoodKey = followHours && closed ? "sleep" : now < shockUntil ? "shock" : band;
      const line = old && old.mood === mood ? old.line : pickLine(mood);
      next[symbol] = { band, mood, line, shockUntil };
      if (!old || old.mood !== mood || old.band !== band || old.shockUntil !== shockUntil) changed = true;
    }
    if (Object.keys(next).length !== Object.keys(petsRef.current).length) changed = true;
    if (changed) setPets(next);
  }, [quotes, shown, followHours, status, liveEnabled]);

  return (
    <main className="desk" data-tauri-drag-region>
      {!watch.ready && <Onboarding onPick={watch.start} />}
      {watch.ready && (
        <>
          <Toolbar
            watch={watch}
            followHours={followHours}
            onFollowHours={setFollowHours}
            scale={scale}
            onScale={setScale}
            status={status}
          />
          <div className="pets" data-tauri-drag-region>
            {shown.map((item) => {
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
            {shown.length === 0 && (
              <p className="empty">＋ 를 눌러 목록에서 띄울 종목을 골라 보세요</p>
            )}
          </div>
        </>
      )}
    </main>
  );
}
