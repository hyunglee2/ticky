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
}

export type Session = "pre" | "regular" | "post" | "closed";

/** State of the live (Yahoo) connection, for the settings panel and the 연결 끊김 state. */
export type LiveStatus = "off" | "connecting" | "ok" | "rate-limit" | "error";
export interface FeedStatus {
  live: LiveStatus;
  missing: string[]; // live symbols the API doesn't know
}

/** Anything that can stream quotes: the fake feed, Finnhub, and KIS later. */
export interface QuoteProvider {
  subscribe(items: WatchItem[], onQuote: (q: Quote) => void, onStatus?: (s: FeedStatus) => void): () => void;
}

/** Korean listings use 6-digit codes and trade in KRW. */
export const isKrx = (symbol: string) => /^\d{6}$/.test(symbol);

export function formatPrice(symbol: string, price: number) {
  return isKrx(symbol)
    ? `${Math.round(price).toLocaleString("ko-KR")}원`
    : `$${price.toFixed(2)}`;
}
