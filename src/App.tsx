import { useEffect, useMemo, useRef, useState } from "react";
import { Pet } from "./components/Pet";
import { Toolbar } from "./components/Toolbar";
import { createFakeFeed } from "./market/fakeFeed";
import { isMarketOpen } from "./market/hours";
import type { Quote, WatchItem } from "./market/types";
import { bandMood, pickLine, type MoodKey } from "./ticky/moods";
import { applyScale } from "./scale";
import { useClickThroughRegions } from "./clickThrough";
import "./App.css";

const MAX_ITEMS = 5;
const DEFAULT_WATCHLIST: WatchItem[] = [
  { symbol: "005930", name: "삼성전자" },
  { symbol: "AAPL", name: "애플" },
  { symbol: "035420", name: "NAVER" },
  { symbol: "TSLA", name: "테슬라" },
  { symbol: "NVDA", name: "엔비디아" },
];

// 놀람: a jump of 2% or more within the recent window (~30 s of fake ticks), shown for 3 s
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
  const feed = useMemo(() => createFakeFeed(), []);
  useClickThroughRegions();

  useEffect(() => save("ticky.watchlist", items), [items]);
  useEffect(() => save("ticky.followHours", followHours), [followHours]);

  const [scale, setScale] = useState<number>(() => load("ticky.scale", 1));
  useEffect(() => {
    save("ticky.scale", scale);
    applyScale(scale).catch(() => { /* window API unavailable: CSS scale still applies */ });
  }, [scale]);

  useEffect(() => {
    return feed.subscribe(items, (q) => setQuotes((prev) => ({ ...prev, [q.symbol]: q })));
  }, [feed, items]);

  // derive each Ticky's mood from its quote; pick a new line only when the mood changes
  useEffect(() => {
    const now = Date.now();
    const next: Record<string, PetState> = {};
    let changed = false;
    for (const { symbol } of items) {
      const q = quotes[symbol];
      const old = petsRef.current[symbol];
      if (!q) continue;
      const band = bandMood(q.changePct, old?.band);
      const h = q.history;
      const recent = h.length > SHOCK_WINDOW ? h[h.length - 1 - SHOCK_WINDOW] : h[0];
      const jumped = Math.abs((h[h.length - 1] / recent - 1) * 100) >= SHOCK_PCT;
      let shockUntil = old?.shockUntil ?? 0;
      if (jumped && now >= shockUntil + SHOCK_MS) shockUntil = now + SHOCK_MS;
      const mood: MoodKey =
        followHours && !isMarketOpen(symbol) ? "sleep" : now < shockUntil ? "shock" : band;
      const line = old && old.mood === mood ? old.line : pickLine(mood);
      next[symbol] = { band, mood, line, shockUntil };
      if (!old || old.mood !== mood || old.band !== band || old.shockUntil !== shockUntil) changed = true;
    }
    if (changed) setPets(next);
  }, [quotes, items, followHours]);

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
