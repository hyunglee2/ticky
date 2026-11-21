export interface WatchItem {
  symbol: string; // e.g. "005930", "AAPL"
  name: string;   // label shown under the Ticky
}

export interface Quote {
  symbol: string;
  price: number;
  prevClose: number;
  changePct: number;   // vs previous close, in %
  history: number[];   // today's prices, oldest first
  updatedAt: number;   // ms epoch, when we received it
  quotedAt?: number;   // ms epoch, when the exchange printed this price (live only)
  source: "fake" | "live";
  session?: Session;   // live only: which part of the trading day the price is from
  name?: string;       // official name from the data source, when it gives one
}

export type Session = "pre" | "regular" | "post" | "closed";

/** State of each live connection, for the settings panel and the 연결 끊김 state. */
export type LiveStatus = "off" | "connecting" | "ok" | "rate-limit" | "error";
export interface FeedStatus {
  us: LiveStatus;    // Yahoo
  kr: LiveStatus;    // Naver
  missing: string[]; // live symbols the sources don't know
}

/** Anything that can stream quotes: the fake feed, Finnhub, and KIS later. */
export interface QuoteProvider {
  subscribe(items: WatchItem[], onQuote: (q: Quote) => void, onStatus?: (s: FeedStatus) => void): () => void;
}

/** Korean listings use 6-character codes starting with a digit (005930, newer ones like 0193T0) and trade in KRW. */
export const isKrx = (symbol: string) => /^\d[0-9A-Z]{5}$/.test(symbol);

export function formatPrice(symbol: string, price: number) {
  return isKrx(symbol)
    ? `${Math.round(price).toLocaleString("ko-KR")}원`
    : `$${price.toFixed(2)}`;
}

/** Names longer than this get the ticker on name tags and price rows instead. */
const LONG_NAME = 12;

/**
 * The short name shown under a Ticky and on price rows. Korean stocks: the name (a bare code like
 * 005930 means nothing, so the source's official name stands in for it). US stocks: the ticker,
 * unless the stock has a short name of its own (애플, 엔비디아) — long fund names like
 * "Direxion Daily Semiconductor Bear 3X ETF" would swamp the screen.
 */
export function displayName(item: WatchItem, quote?: Quote): string {
  if (isKrx(item.symbol)) return item.name === item.symbol && quote?.name ? quote.name : item.name;
  return item.name === item.symbol || item.name.length > LONG_NAME ? item.symbol : item.name;
}

/** The full name, for the details card (when it says more than the short one). */
export function fullName(item: WatchItem, quote?: Quote): string | undefined {
  const full = quote?.name && quote.name !== item.symbol ? quote.name : item.name;
  return full !== displayName(item, quote) ? full : undefined;
}
