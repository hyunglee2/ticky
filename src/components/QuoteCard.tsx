import { isUsDayMarket } from "../market/hours";
import { formatPrice, isKrx, type Quote, type Session } from "../market/types";
import type { Tone } from "../ticky/moods";
import { Sparkline } from "./Sparkline";

// a live price older than this is the last trade before a quiet stretch (night, weekend)
const STALE_MS = 15 * 60 * 1000;

const SESSION_NAME: Record<Session, string> = {
  pre: "프리마켓", regular: "정규장", post: "애프터마켓", day: "주간거래", closed: "장 마감",
};

/** Two short lines: where the price is from, and how fresh it is. */
function sourceText(q: Quote): [string, string] {
  if (q.source === "fake") return ["가짜 시세", ""];
  const krx = isKrx(q.symbol);
  const from = krx ? "네이버" : q.session === "day" ? "한국투자증권" : "Yahoo";
  const head = `${from} · ${q.session ? SESSION_NAME[q.session] : ""}`;
  if (q.quotedAt && Date.now() - q.quotedAt > STALE_MS) {
    const d = new Date(q.quotedAt);
    const hm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    return [head, `${d.getMonth() + 1}/${d.getDate()} ${hm} 기준`];
  }
  return [head, `${krx ? "7초" : "15초"}마다 갱신`];
}

const signed = (n: number, digits = 2) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toFixed(digits)}`;

interface Props {
  name: string;
  /** the long official name, shown small under the short one */
  fullName?: string;
  moodLabel: string;
  quote: Quote;
  tone: Tone;
  className?: string;
}

/** The stock's details: price, change, today's line and where the price is from. */
export function QuoteCard({ name, fullName, moodLabel, quote, tone, className }: Props) {
  return (
    <div className={className ? `card ${className}` : "card"}>
      <div className="card-top">
        <span className="card-name">{name}</span>
        <span className="card-mood">{moodLabel}</span>
      </div>
      {fullName && <div className="card-full" title={fullName}>{fullName}</div>}
      <div className="card-price">{formatPrice(quote.symbol, quote.price)}</div>
      <div className={`card-change ${tone}`}>
        {signed(quote.price - quote.prevClose, quote.prevClose > 1000 ? 0 : 2)} ({signed(quote.changePct)}%)
      </div>
      <Sparkline values={quote.history} base={quote.prevClose} tone={tone} />
      {sourceText(quote).filter(Boolean).map((l) => (
        <div key={l} className="card-source">{l}</div>
      ))}
      {/* US stock in Korean daytime without a KIS key: this is last night's price */}
      {quote.source === "live" && !isKrx(quote.symbol) && quote.session !== "day" && isUsDayMarket() && (
        <div className="card-tip">지금 주간거래 시세는 설정 → 시세 연결에서 한국투자증권을 연결하면 볼 수 있어요</div>
      )}
    </div>
  );
}
