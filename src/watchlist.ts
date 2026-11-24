// Watchlist rules (see "관심 종목 규칙" in the planning doc):
//   - every stock on the list is on screen (as a Ticky or a price row); up to 5
//   - first run starts from 3 representative stocks of the chosen market
//   - add from the search box, delete from the list / a Ticky's menu / swiping a price row
import { useCallback, useEffect, useRef, useState } from "react";
import { EV, on, send } from "./sync";
import type { WatchItem } from "./market/types";
import type { Outfit } from "./ticky/outfit";

export const MAX_LIST = 5;

/** a stock on the list, and what its Ticky is wearing (꾸미기) */
export type WatchEntry = WatchItem & { outfit?: Outfit };

export type StarterMarket = "kr" | "us" | "both";

export const STARTERS: Record<StarterMarket, WatchItem[]> = {
  kr: [
    { symbol: "005930", name: "삼성전자" },
    { symbol: "000660", name: "SK하이닉스" },
    { symbol: "005380", name: "현대차" },
  ],
  us: [
    { symbol: "AAPL", name: "애플" },
    { symbol: "NVDA", name: "엔비디아" },
    { symbol: "TSLA", name: "테슬라" },
  ],
  both: [
    { symbol: "005930", name: "삼성전자" },
    { symbol: "000660", name: "SK하이닉스" },
    { symbol: "NVDA", name: "엔비디아" },
  ],
};

const KEY = "ticky.watchlist.v2";
const OLD_KEY = "ticky.watchlist"; // v1: a plain array of items, all shown

// per-viewer data on this PC; the app still starts (with onboarding) if storage is unavailable
function read(): WatchEntry[] | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      // older lists could hold 20 with only some shown: keep the shown ones first, up to the limit
      const saved = JSON.parse(raw) as (WatchEntry & { shown?: boolean })[];
      const ordered = [...saved.filter((e) => e.shown !== false), ...saved.filter((e) => e.shown === false)];
      return ordered.slice(0, MAX_LIST).map((e) => ({ symbol: e.symbol, name: e.name, ...(e.outfit ? { outfit: e.outfit } : {}) }));
    }
    const old = localStorage.getItem(OLD_KEY);
    if (old) return (JSON.parse(old) as WatchItem[]).slice(0, MAX_LIST).map((it) => ({ symbol: it.symbol, name: it.name }));
  } catch { /* fall through to onboarding */ }
  return null;
}
function write(entries: WatchEntry[]) {
  try { localStorage.setItem(KEY, JSON.stringify(entries)); } catch { /* ignore */ }
}

export type AddResult = "added" | "duplicate" | "full";

export function useWatchlist() {
  // null = never set up yet → show the first-run market picker
  const [entries, setEntries] = useState<WatchEntry[] | null>(read);

  // saved here, and shared with the other window (Tickies ↔ settings): a change made in one
  // shows up in the other. Only real changes are sent, so the two never echo each other.
  const synced = useRef(JSON.stringify(entries));
  useEffect(() => {
    if (!entries) return;
    write(entries);
    const json = JSON.stringify(entries);
    if (json !== synced.current) {
      synced.current = json;
      send(EV.watchlist, entries);
    }
  }, [entries]);
  useEffect(() => on<WatchEntry[]>(EV.watchlist, (list) => {
    synced.current = JSON.stringify(list);
    setEntries(list);
  }), []);

  const list = entries ?? [];

  const start = useCallback((market: StarterMarket) => {
    setEntries(STARTERS[market].map((it) => ({ ...it })));
  }, []);

  const add = useCallback((item: WatchItem): AddResult => {
    if (list.some((e) => e.symbol === item.symbol)) return "duplicate";
    if (list.length >= MAX_LIST) return "full";
    setEntries([...list, { ...item }]);
    return "added";
  }, [list]);

  const remove = useCallback((symbol: string) => {
    setEntries(list.filter((e) => e.symbol !== symbol));
  }, [list]);

  const move = useCallback((from: number, to: number) => {
    if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return;
    const next = [...list];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setEntries(next);
  }, [list]);

  /** dress a Ticky (an empty outfit takes everything off) */
  const setOutfit = useCallback((symbol: string, outfit: Outfit) => {
    const clean = Object.fromEntries(Object.entries(outfit).filter(([, v]) => v)) as Outfit;
    setEntries(list.map((e) => (e.symbol === symbol ? { ...e, outfit: Object.keys(clean).length ? clean : undefined } : e)));
  }, [list]);

  return {
    ready: entries !== null,
    entries: list,
    shown: list, // everything on the list is on screen
    start,
    add,
    remove,
    move,
    setOutfit,
  };
}

export type Watchlist = ReturnType<typeof useWatchlist>;
