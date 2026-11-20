// Watchlist rules (see "관심 종목 규칙" in the planning doc):
//   - the list holds up to 20 stocks; up to 5 of them are shown as Tickies
//   - first run starts from 3 representative stocks of the chosen market
//   - × on a Ticky only hides it; deleting from the list removes it
import { useCallback, useEffect, useState } from "react";
import type { WatchItem } from "./market/types";

export const MAX_LIST = 20;
export const MAX_SHOWN = 5;

export interface WatchEntry extends WatchItem {
  shown: boolean;
}

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
    if (raw) return JSON.parse(raw) as WatchEntry[];
    const old = localStorage.getItem(OLD_KEY);
    if (old) {
      const items = (JSON.parse(old) as WatchItem[]).slice(0, MAX_LIST);
      return items.map((it, i) => ({ symbol: it.symbol, name: it.name, shown: i < MAX_SHOWN }));
    }
  } catch { /* fall through to onboarding */ }
  return null;
}
function write(entries: WatchEntry[]) {
  try { localStorage.setItem(KEY, JSON.stringify(entries)); } catch { /* ignore */ }
}

export type AddResult = "shown" | "listed" | "duplicate" | "full";

export function useWatchlist() {
  // null = never set up yet → show the first-run market picker
  const [entries, setEntries] = useState<WatchEntry[] | null>(read);

  useEffect(() => { if (entries) write(entries); }, [entries]);

  const list = entries ?? [];
  const shownCount = list.filter((e) => e.shown).length;

  const start = useCallback((market: StarterMarket) => {
    setEntries(STARTERS[market].map((it) => ({ ...it, shown: true })));
  }, []);

  const add = useCallback((item: WatchItem): AddResult => {
    if (list.some((e) => e.symbol === item.symbol)) return "duplicate";
    if (list.length >= MAX_LIST) return "full";
    const shown = shownCount < MAX_SHOWN;
    setEntries([...list, { ...item, shown }]);
    return shown ? "shown" : "listed";
  }, [list, shownCount]);

  const remove = useCallback((symbol: string) => {
    setEntries(list.filter((e) => e.symbol !== symbol));
  }, [list]);

  /** Show or hide on screen. Returns false when showing would go past MAX_SHOWN. */
  const setShown = useCallback((symbol: string, shown: boolean): boolean => {
    if (shown && shownCount >= MAX_SHOWN) return false;
    setEntries(list.map((e) => (e.symbol === symbol ? { ...e, shown } : e)));
    return true;
  }, [list, shownCount]);

  const move = useCallback((from: number, to: number) => {
    if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return;
    const next = [...list];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setEntries(next);
  }, [list]);

  return {
    ready: entries !== null,
    entries: list,
    shown: list.filter((e) => e.shown),
    shownCount,
    start,
    add,
    remove,
    setShown,
    move,
  };
}

export type Watchlist = ReturnType<typeof useWatchlist>;
