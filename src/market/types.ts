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
  updatedAt: number;   // ms epoch
}

/** Anything that can stream quotes: the fake feed now, a real API (Finnhub, KIS) later. */
export interface QuoteProvider {
  subscribe(items: WatchItem[], onQuote: (q: Quote) => void): () => void;
}

/** Korean listings use 6-digit codes and trade in KRW. */
export const isKrx = (symbol: string) => /^\d{6}$/.test(symbol);

export function formatPrice(symbol: string, price: number) {
  return isKrx(symbol)
    ? `${Math.round(price).toLocaleString("ko-KR")}원`
    : `$${price.toFixed(2)}`;
}
