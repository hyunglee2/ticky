import { useEffect, useMemo, useRef, useState } from "react";
import { Pet } from "./components/Pet";
import { Toolbar } from "./components/Toolbar";
import { createHybridFeed } from "./market/hybridFeed";
import { isMarketOpen } from "./market/hours";
import { isKrx, type FeedStatus, type Quote, type WatchItem } from "./market/types";
import { bandMood, pickLine, type MoodKey } from "./ticky/moods";
import { applyScale } from "./scale";
import { inTauri, useClickThroughRegions } from "./clickThrough";
import "./App.css";

const MAX_ITEMS = 5;
const DEFAULT_WATCHLIST: WatchItem[] = [
  { symbol: "005930", name: "삼성전자" },
  { symbol: "AAPL", name: "애플" },
  { symbol: "035420", name: "NAVER" },
  { symbol: "TSLA", name: "테슬라" },
  { symbol: "NVDA", name: "엔비디아" },
];

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
  const [items, setItems] = useState<WatchItem[]>(() => load("ticky.watchlist", DEFAULT_WATCHLIST));
  const [followHours, setFollowHours] = useState<boolean>(() => load("ticky.followHours", false));
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const [pets, setPets] = useState<Record<string, PetState>>({});
  const petsRef = useRef(pets);
  petsRef.current = pets;
  // live US quotes need the Rust side, so only in the desktop app (not the browser preview)
  const liveEnabled = useMemo(() => inTauri(), []);
  const [status, setStatus] = useState<FeedStatus>({ us: "off", kr: "off", missing: [] });
  const feed = useMemo(() => createHybridFeed(liveEnabled), [liveEnabled]);
  useClickThroughRegions();

  useEffect(() => save("ticky.watchlist", items), [items]);
  useEffect(() => save("ticky.followHours", followHours), [followHours]);

  const [scale, setScale] = useState<number>(() => load("ticky.scale", 1));
  useEffect(() => {
    save("ticky.scale", scale);
    applyScale(scale).catch(() => { /* window API unavailable: CSS scale still applies */ });
  }, [scale]);

  useEffect(() => {
    return feed.subscribe(items, (q) => setQuotes((prev) => ({ ...prev, [q.symbol]: q })), setStatus);
  }, [feed, items]);

  // derive each Ticky's mood from its quote; pick a new line only when the mood changes
  useEffect(() => {
    const now = Date.now();
    const next: Record<string, PetState> = {};
    let changed = false;
    for (const { symbol } of items) {
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
  }, [quotes, items, followHours, status, liveEnabled]);

  const add = (item: WatchItem) => {
    setItems((list) =>
      list.length >= MAX_ITEMS || list.some((i) => i.symbol === item.symbol) ? list : [...list, item],
    );
  };
  const remove = (symbol: string) => setItems((list) => list.filter((i) => i.symbol !== symbol));

  return (
    <main className="desk" data-tauri-drag-region>
      <Toolbar
        canAdd={items.length < MAX_ITEMS}
        onAdd={add}
        followHours={followHours}
        onFollowHours={setFollowHours}
        scale={scale}
        onScale={setScale}
        status={status}
      />
      <div className="pets" data-tauri-drag-region>
        {items.map((item) => {
          const p = pets[item.symbol];
          return p ? (
            <Pet
              key={item.symbol}
              item={item}
              quote={quotes[item.symbol]}
              mood={p.mood}
              line={p.line}
              onRemove={() => remove(item.symbol)}
            />
          ) : null;
        })}
        {items.length === 0 && <p className="empty">＋ 를 눌러 종목을 추가해 보세요</p>}
      </div>
    </main>
  );
}
