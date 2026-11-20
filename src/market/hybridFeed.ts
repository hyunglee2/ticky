// US symbols come from Yahoo Finance (fetched by the Rust side), including pre-market and
// after-hours; KRX symbols stay on the fake feed until KIS is connected.
import { invoke } from "@tauri-apps/api/core";
import { createFakeFeed } from "./fakeFeed";
import { isKrx, type FeedStatus, type LiveStatus, type QuoteProvider, type Session } from "./types";

const POLL_MS = 15_000;
const HISTORY = 160;

interface LiveQuote { symbol: string; price: number; prevClose: number; time: number; session: Session }
interface QuoteBatch { quotes: LiveQuote[]; missing: string[] }

const statusFor = (error: unknown): LiveStatus => (String(error) === "rate-limit" ? "rate-limit" : "error");

/** `liveEnabled` is false outside the desktop app (e.g. the browser preview), where Rust isn't there. */
export function createHybridFeed(liveEnabled: boolean): QuoteProvider {
  const fake = createFakeFeed();
  const history = new Map<string, number[]>(); // polled prices per live symbol since launch

  return {
    subscribe(items, onQuote, onStatus) {
      const live = liveEnabled ? items.filter((i) => !isKrx(i.symbol)).map((i) => i.symbol) : [];
      const stopFake = fake.subscribe(items.filter((i) => !live.includes(i.symbol)), onQuote);
      const report = (s: FeedStatus) => onStatus?.(s);
      if (live.length === 0) {
        report({ live: "off", missing: [] });
        return stopFake;
      }

      let stopped = false;
      report({ live: "connecting", missing: [] });
      const poll = async () => {
        try {
          const batch = await invoke<QuoteBatch>("fetch_yahoo_quotes", { symbols: live });
          if (stopped) return;
          for (const q of batch.quotes) {
            const h = history.get(q.symbol) ?? [];
            h.push(q.price);
            if (h.length > HISTORY) h.shift();
            history.set(q.symbol, h);
            onQuote({
              symbol: q.symbol,
              price: q.price,
              prevClose: q.prevClose,
              changePct: (q.price / q.prevClose - 1) * 100,
              history: [...h],
              updatedAt: Date.now(),
              quotedAt: q.time * 1000,
              source: "live",
              session: q.session,
            });
          }
          report({ live: "ok", missing: batch.missing });
        } catch (e) {
          if (!stopped) report({ live: statusFor(e), missing: [] });
        }
      };
      poll();
      const timer = setInterval(poll, POLL_MS);
      return () => {
        stopped = true;
        clearInterval(timer);
        stopFake();
      };
    },
  };
}
