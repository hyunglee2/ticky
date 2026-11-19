// Fake quote feed for the MVP: a mean-reverting random walk per symbol, with rare jumps
// so every mood (and the 놀람 special state) shows up without a real market connection.
import { isKrx, type Quote, type QuoteProvider, type WatchItem } from "./types";

const TICK_MS = 1500;
const HISTORY = 160;

// stable per-symbol numbers so a stock keeps its "personality" across restarts
function hash(s: string) {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return (h >>> 0) / 4294967295;
}

interface SimState {
  prevClose: number;
  target: number;      // the % change the walk drifts toward, wanders slowly
  vol: number;         // per-tick noise, in %
  history: number[];
}

function initState(symbol: string): SimState {
  const r = hash(symbol);
  const prevClose = isKrx(symbol)
    ? Math.round((8000 + r * 190000) / 50) * 50
    : Math.round((40 + r * 460) * 100) / 100;
  // spread starting moods from about −12% to +12%
  const startPct = (hash(symbol + "start") - 0.5) * 24;
  const price = prevClose * (1 + startPct / 100);
  return {
    prevClose,
    target: startPct,
    vol: 0.08 + hash(symbol + "vol") * 0.35,
    history: [price],
  };
}

function step(s: SimState) {
  const last = s.history[s.history.length - 1];
  const pct = (last / s.prevClose - 1) * 100;
  // the target wanders, and now and then jumps (news), which can trigger 놀람
  s.target += (Math.random() - 0.5) * 0.6;
  if (Math.random() < 0.012) s.target += (Math.random() < 0.5 ? -1 : 1) * (2.5 + Math.random() * 3);
  s.target = Math.max(-16, Math.min(16, s.target));
  const pull = (s.target - pct) * 0.08;
  const noise = (Math.random() - 0.5) * 2 * s.vol;
  const next = last * (1 + (pull + noise) / 100);
  s.history.push(next);
  if (s.history.length > HISTORY) s.history.shift();
}

function toQuote(symbol: string, s: SimState): Quote {
  const price = s.history[s.history.length - 1];
  return {
    symbol,
    price,
    prevClose: s.prevClose,
    changePct: (price / s.prevClose - 1) * 100,
    history: [...s.history],
    updatedAt: Date.now(),
  };
}

export function createFakeFeed(): QuoteProvider {
  const states = new Map<string, SimState>();
  return {
    subscribe(items: WatchItem[], onQuote) {
      for (const { symbol } of items) {
        if (!states.has(symbol)) states.set(symbol, initState(symbol));
        onQuote(toQuote(symbol, states.get(symbol)!));
      }
      const timer = setInterval(() => {
        for (const { symbol } of items) {
          const s = states.get(symbol)!;
          step(s);
          onQuote(toQuote(symbol, s));
        }
      }, TICK_MS);
      return () => clearInterval(timer);
    },
  };
}
