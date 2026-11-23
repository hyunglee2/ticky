// Live quotes, fetched by the Rust side:
//   - US tickers from Yahoo Finance every 15 s (pre-market and after-hours included);
//     during 주간거래 hours (daytime in Korea) from KIS instead, if the user connected an app key
//   - KRX codes from Naver Finance every 7 s (near real-time)
// Both are unofficial sources: fine for a personal prototype, to be replaced before release.
// Outside the desktop app (browser preview) everything runs on the fake feed.
import { invoke } from "@tauri-apps/api/core";
import { createFakeFeed } from "./fakeFeed";
import { isUsDayMarket } from "./hours";
import { isKrx, type FeedStatus, type LiveStatus, type Quote, type QuoteProvider, type Session } from "./types";

const HISTORY = 160;
// no new trade for this long, then trading again = the market (re)opened: start a new stretch
const QUIET_GAP_MS = 5 * 60_000;
const RECENT = 60;

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
  // prices since trading last resumed, with the trade time and session they came with
  const stretch = new Map<string, { prices: number[]; at?: number; session?: string }>();

  return {
    subscribe(items, onQuote, onStatus) {
      if (!liveEnabled) {
        onStatus?.({ us: "off", kr: "off", day: "off", missing: [] });
        return fake.subscribe(items, onQuote);
      }

      let stopped = false;
      const status: FeedStatus = { us: "off", kr: "off", day: "off", missing: [] };
      const missing = { us: [] as string[], kr: [] as string[] };
      const report = () => onStatus?.({ ...status, missing: [...missing.us, ...missing.kr] });

      // is a KIS app key connected? asked now and whenever the settings change it
      let kisOn = false;
      const checkKis = () => invoke<boolean>("kis_status").then((on) => {
        kisOn = on;
        status.day = on ? (status.day === "off" ? "ok" : status.day) : "off";
        report();
      }).catch(() => {});
      checkKis();
      window.addEventListener("ticky:kis-changed", checkKis);

      const emit = (q: RawQuote) => {
        const h = history.get(q.symbol) ?? [];
        h.push(q.price);
        if (h.length > HISTORY) h.shift();
        history.set(q.symbol, h);
        const quotedAt = q.time ? q.time * 1000 : q.tradedAt ? Date.parse(q.tradedAt) : undefined;
        let st = stretch.get(q.symbol);
        const resumed = st && (
          st.session !== q.session ||
          (quotedAt !== undefined && st.at !== undefined && quotedAt - st.at > QUIET_GAP_MS)
        );
        if (!st || resumed) st = { prices: [] };
        st.prices.push(q.price);
        if (st.prices.length > RECENT) st.prices.shift();
        st.at = quotedAt ?? st.at;
        st.session = q.session;
        stretch.set(q.symbol, st);
        const quote: Quote = {
          symbol: q.symbol,
          price: q.price,
          prevClose: q.prevClose,
          changePct: (q.price / q.prevClose - 1) * 100,
          history: [...h],
          recent: [...st.prices],
          updatedAt: Date.now(),
          quotedAt,
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
            let batch: RawBatch | undefined;
            // US during 주간거래 hours: KIS when connected (falls back to Yahoo's last prices on failure)
            if (src.key === "us" && kisOn && isUsDayMarket()) {
              try {
                batch = await invoke<RawBatch>("fetch_kis_quotes", { symbols });
                status.day = "ok";
                // tickers that don't trade in the day market keep Yahoo's last price
                if (batch.missing.length) {
                  const rest = await invoke<RawBatch>(src.command, { [src.arg]: batch.missing });
                  batch = { quotes: [...batch.quotes, ...rest.quotes], missing: rest.missing };
                }
              } catch (e) {
                status.day = statusFor(e);
                batch = undefined;
              }
            }
            batch ??= await invoke<RawBatch>(src.command, { [src.arg]: symbols });
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
        window.removeEventListener("ticky:kis-changed", checkKis);
        timers.forEach((t) => t && clearInterval(t));
      };
    },
  };
}
