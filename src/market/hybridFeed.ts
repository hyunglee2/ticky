// Live quotes, fetched by the Rust side:
//   - US tickers from Yahoo Finance every 15 s (pre-market and after-hours included)
//   - KRX codes from Naver Finance every 7 s (near real-time)
// Both are unofficial sources: fine for a personal prototype, to be replaced before release.
// Outside the desktop app (browser preview) everything runs on the fake feed.
import { invoke } from "@tauri-apps/api/core";
import { createFakeFeed } from "./fakeFeed";
import { isKrx, type FeedStatus, type LiveStatus, type Quote, type QuoteProvider, type Session } from "./types";

const HISTORY = 160;

/** What both Rust commands return per symbol. */
interface RawQuote {
  symbol: string;
  price: number;
  prevClose: number;
  session: Session;
  time?: number;      // Yahoo: unix seconds
  tradedAt?: string;  // Naver: ISO time
  name?: string;      // Naver: official name
}
interface RawBatch { quotes: RawQuote[]; missing: string[] }

interface Source {
  key: "us" | "kr";
  command: string;
  arg: string;        // the Rust command's parameter name
  intervalMs: number;
  owns: (symbol: string) => boolean;
}

const SOURCES: Source[] = [
  { key: "us", command: "fetch_yahoo_quotes", arg: "symbols", intervalMs: 15_000, owns: (s) => !isKrx(s) },
  { key: "kr", command: "fetch_naver_quotes", arg: "codes", intervalMs: 7_000, owns: isKrx },
];

const statusFor = (error: unknown): LiveStatus => (String(error) === "rate-limit" ? "rate-limit" : "error");

export function createHybridFeed(liveEnabled: boolean): QuoteProvider {
  const fake = createFakeFeed();
  const history = new Map<string, number[]>(); // polled prices per live symbol since launch

  return {
    subscribe(items, onQuote, onStatus) {
      if (!liveEnabled) {
        onStatus?.({ us: "off", kr: "off", missing: [] });
        return fake.subscribe(items, onQuote);
      }

      let stopped = false;
      const status: FeedStatus = { us: "off", kr: "off", missing: [] };
      const missing = { us: [] as string[], kr: [] as string[] };
      const report = () => onStatus?.({ ...status, missing: [...missing.us, ...missing.kr] });

      const emit = (q: RawQuote) => {
        const h = history.get(q.symbol) ?? [];
        h.push(q.price);
        if (h.length > HISTORY) h.shift();
        history.set(q.symbol, h);
        const quote: Quote = {
          symbol: q.symbol,
          price: q.price,
          prevClose: q.prevClose,
          changePct: (q.price / q.prevClose - 1) * 100,
          history: [...h],
          updatedAt: Date.now(),
          quotedAt: q.time ? q.time * 1000 : q.tradedAt ? Date.parse(q.tradedAt) : undefined,
          source: "live",
          session: q.session,
          name: q.name,
        };
        onQuote(quote);
      };

      const timers = SOURCES.map((src) => {
        const symbols = items.map((i) => i.symbol).filter(src.owns);
        if (symbols.length === 0) return undefined;
        status[src.key] = "connecting";
        const poll = async () => {
          try {
            const batch = await invoke<RawBatch>(src.command, { [src.arg]: symbols });
            if (stopped) return;
            batch.quotes.forEach(emit);
            status[src.key] = "ok";
            missing[src.key] = batch.missing;
          } catch (e) {
            if (stopped) return;
            status[src.key] = statusFor(e);
            missing[src.key] = [];
          }
          report();
        };
        poll();
        return setInterval(poll, src.intervalMs);
      });
      report();

      return () => {
        stopped = true;
        timers.forEach((t) => t && clearInterval(t));
      };
    },
  };
}
